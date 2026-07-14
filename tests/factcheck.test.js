const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let registeredSkill = null;
global.window = global;
global.Quantum = { skills: { register(def) { registeredSkill = def; } } };

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/factcheck.js'), 'utf8'));
const fc = window.Quantum.factcheck;

test('Skill „faktencheck" ist registriert', () => {
  assert.equal(registeredSkill.id, 'faktencheck');
  assert.match(registeredSkill.name, /Faktenchecker/);
});

test('keywords entfernt Stoppwörter und kurze Wörter', () => {
  const q = fc.keywords('Die Berliner Mauer fiel im Jahr 1989');
  assert.ok(!/\bDie\b/.test(q));
  assert.ok(!/\bim\b/.test(q));
  assert.match(q, /Berliner/);
  assert.match(q, /Mauer/);
  assert.match(q, /1989/);
});

test('keywords fällt auf Roh-Behauptung zurück, wenn nichts übrig bleibt', () => {
  assert.equal(fc.keywords('ist es'), 'ist es');
});

test('parseVerdict erkennt STIMMT / STIMMT NICHT / UNKLAR', () => {
  const ja = fc.parseVerdict('URTEIL: STIMMT\nBEGRÜNDUNG: Weil die Belege es sagen.');
  assert.equal(ja.emoji, '✅');
  assert.equal(ja.verdict, 'Stimmt');
  assert.match(ja.reasoning, /Belege/);

  const nein = fc.parseVerdict('URTEIL: STIMMT NICHT\nBEGRÜNDUNG: Widerlegt.');
  assert.equal(nein.emoji, '❌');
  assert.equal(nein.verdict, 'Stimmt nicht');

  const unklar = fc.parseVerdict('URTEIL: UNKLAR\nBEGRÜNDUNG: Zu wenig Belege.');
  assert.equal(unklar.emoji, '⚠️');
});

test('parseVerdict ohne Format → Unklar, Rohtext als Begründung', () => {
  const p = fc.parseVerdict('Keine klare Aussage möglich.');
  assert.equal(p.emoji, '⚠️');
  assert.match(p.reasoning, /Keine klare Aussage/);
});

test('buildRequest bettet Belege ein und fordert das feste Format', () => {
  const req = fc.buildRequest('X ist Y', [{ title: 'Artikel', extract: 'Beleg-Text' }]);
  assert.match(req.system, /AUSSCHLIESSLICH/);
  assert.match(req.system, /URTEIL:/);
  assert.match(req.prompt, /Behauptung: "X ist Y"/);
  assert.match(req.prompt, /Beleg-Text/);
});

test('formatResult enthält Urteil, Begründung, Quelle und Disclaimer', () => {
  const out = fc.formatResult('Test', { emoji: '✅', verdict: 'Stimmt', reasoning: 'Grund.' },
    [{ title: 'Q', url: 'https://de.wikipedia.org/wiki/Q' }]);
  assert.match(out, /FAKTENCHECK/);
  assert.match(out, /✅ \*\*Stimmt\*\*/);
  assert.match(out, /\[Q\]\(https:\/\/de\.wikipedia\.org\/wiki\/Q\)/);
  assert.match(out, /Wikipedia/);
});
