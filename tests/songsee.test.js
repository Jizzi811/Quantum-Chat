const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Kein document → DOM/Audio-Teil wird übersprungen, Skill wird registriert.
let registeredSkill = null;
global.window = global;
global.Quantum = { skills: { register(def) { registeredSkill = def; } } };

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/songsee.js'), 'utf8'));
const s = window.Quantum.songsee;

test('Skill „songsee" ist registriert und beschreibt den Visualizer', () => {
  assert.equal(registeredSkill.id, 'songsee');
  assert.match(registeredSkill.desc, /Visualizer|Beat/i);
});

test('colorAt interpoliert zwischen Palettenstufen', () => {
  const start = s.colorAt('classic', 0);
  assert.deepEqual(start, [3, 1, 18]);
  // value=1 wird auf 0.999 geklemmt (Index-Schutz) → nahe der obersten Stufe (fast weiß)
  const end = s.colorAt('classic', 1);
  end.forEach((c) => assert.ok(c >= 250, 'Kanal nahe 255: ' + c));
  // Wert in der Mitte liegt zwischen zwei Stops
  const mid = s.colorAt('classic', 0.5);
  assert.equal(mid.length, 3);
  mid.forEach((c) => assert.ok(c >= 0 && c <= 255));
});

test('colorAt fällt bei unbekannter Palette auf classic zurück', () => {
  assert.deepEqual(s.colorAt('gibtsnicht', 0), [3, 1, 18]);
});

test('bassEnergy mittelt die unteren Bins und normiert auf 0..1', () => {
  assert.equal(s.bassEnergy([]), 0);
  const full = new Array(64).fill(255);
  assert.equal(s.bassEnergy(full), 1);
  const zero = new Array(64).fill(0);
  assert.equal(s.bassEnergy(zero), 0);
});

test('createBeatDetector meldet einen Beat bei plötzlichem Energie-Anstieg', () => {
  const step = s.createBeatDetector();
  // Einschwingen auf niedrigem Niveau
  for (let i = 0; i < 10; i++) step(0.2);
  const spike = step(1.0); // deutlicher Anstieg
  assert.equal(spike.beat, true);
});

test('createBeatDetector meldet keinen Beat bei konstanter Energie', () => {
  const step = s.createBeatDetector();
  let last = { beat: false };
  for (let i = 0; i < 20; i++) last = step(0.5);
  assert.equal(last.beat, false);
});

test('createBeatDetector unterdrückt Beats unter dem Rauschboden', () => {
  const step = s.createBeatDetector({ floor: 0.05 });
  step(0.0001);
  const tiny = step(0.002); // relativer Anstieg, aber unter floor
  assert.equal(tiny.beat, false);
});
