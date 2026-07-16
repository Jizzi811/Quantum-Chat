const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/presentation.js'), 'utf8');
let skill;
global.window = global;
global.Quantum = { skills: { register(def) { skill = def; } } };
vm.runInThisContext(source);

test('registriert das kostenlose In-App Präsentations-Studio', () => {
  assert.equal(skill.id, 'praesentation');
  assert.equal(skill.name, 'Präsentations-Studio');
  assert.equal(typeof Quantum.presentation.open, 'function');
  assert.equal(typeof Quantum.presentation.parse, 'function');
});

test('parst ein JSON-Foliendeck sicher', () => {
  const deck = Quantum.presentation.parse('```json\n[{"title":"Start","bullets":["A"]}]\n```');
  assert.deepEqual(deck[0].bullets, ['A']);
});

test('erzeugt bei KI-Ausfall ein Grunddeck', () => {
  const deck = Quantum.presentation.fallbackDeck('Quantum', 5);
  assert.equal(deck.length, 5);
  assert.equal(deck[0].title, 'Quantum');
  assert.equal(deck[4].title, 'Nächste Schritte');
});

test('entfernt alle Presenton-Infrastruktur-Reste', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../Caddyfile'), 'utf8'), /presenton/i);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../diploi.yaml'), 'utf8'), /PRESENTON_URL/);
  assert.equal(fs.existsSync(path.join(__dirname, '../PRESENTON_SETUP.md')), false);
});

test('bindet Studio-CSS und PPTX-Modul ein', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /presentation-studio\.css/);
  assert.match(html, /pptxgenjs/);
});
