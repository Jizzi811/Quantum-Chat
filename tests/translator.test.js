const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE nachbilden. Kein document → DOM-Teil wird übersprungen.
let registeredSkill = null;
global.window = global;
global.Quantum = { skills: { register(def) { registeredSkill = def; } } };

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/translator.js'), 'utf8'));
const t = window.Quantum.translator;

test('Skill „uebersetzer" ist registriert', () => {
  assert.equal(registeredSkill.id, 'uebersetzer');
  assert.match(registeredSkill.name, /bersetzer/);
});

test('parseTarget erkennt Sprach-Präfix (Code und Name)', () => {
  assert.deepEqual(t.parseTarget('en: Hallo Welt'), { target: 'Englisch', text: 'Hallo Welt' });
  assert.deepEqual(t.parseTarget('französisch: Guten Morgen'), { target: 'Französisch', text: 'Guten Morgen' });
  assert.deepEqual(t.parseTarget('  de :  test '), { target: 'Deutsch', text: 'test' });
});

test('parseTarget ohne Präfix → automatisch (leere Zielsprache)', () => {
  assert.deepEqual(t.parseTarget('Nur ein Satz ohne Sprache'), { target: '', text: 'Nur ein Satz ohne Sprache' });
  // Ein Wort mit Doppelpunkt, aber unbekannte Sprache → kein Präfix
  assert.deepEqual(t.parseTarget('xy: bleibt Text'), { target: '', text: 'xy: bleibt Text' });
});

test('buildRequest baut einen Übersetzungs-Request mit Zielsprache', () => {
  const req = t.buildRequest('Hallo', 'Englisch');
  assert.match(req.system, /nach Englisch/);
  assert.match(req.system, /AUSSCHLIESSLICH die Übersetzung/);
  assert.equal(req.prompt, 'Hallo');
  assert.ok(req.temperature <= 0.3);
});

test('buildRequest ohne Ziel nutzt Deutsch/Englisch-Fallback', () => {
  const req = t.buildRequest('Hello', '');
  assert.match(req.system, /Deutsch/);
});
