const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE in js/tts-studio.js nachbilden.
let registeredSkill = null;
const store = {};
global.window = global;
global.Quantum = {
  skills: { register(def) { registeredSkill = def; } },
};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/tts-studio.js'), 'utf8'));
const tts = window.Quantum.ttsStudio;

test('Skill „tts" ist mit Icon und Namen registriert', () => {
  assert.equal(registeredSkill.id, 'tts');
  assert.match(registeredSkill.name, /VoxCPM/);
});

test('normalizeServer ergänzt https und entfernt Slashes am Ende', () => {
  assert.equal(tts.normalizeServer('openbmb-voxcpm-demo.hf.space/'), 'https://openbmb-voxcpm-demo.hf.space');
  assert.equal(tts.normalizeServer('http://localhost:8808'), 'http://localhost:8808');
  assert.equal(tts.normalizeServer('  '), '');
});

test('buildPayload folgt der _generate-Signatur des VoxCPM-Demos', () => {
  const { data } = tts.buildPayload({ text: 'Hallo', instruction: 'ruhig', cfg: 2.5, steps: 12, seed: 42 });
  assert.equal(data.length, 10);
  assert.equal(data[0], 'Hallo');            // text
  assert.equal(data[1], 'ruhig');            // control_instruction
  assert.equal(data[2], null);               // ref_wav
  assert.equal(data[3], false);              // use_prompt_text
  assert.equal(data[5], 2.5);                // cfg_value
  assert.equal(data[8], 12);                 // dit_steps
  assert.equal(data[9], 42);                 // seed
});

test('buildPayload begrenzt CFG und Steps auf gültige Bereiche', () => {
  const high = tts.buildPayload({ text: 'x', cfg: 9, steps: 999 }).data;
  assert.equal(high[5], 3.0);
  assert.equal(high[8], 50);
  const low = tts.buildPayload({ text: 'x', cfg: 0, steps: 0 }).data;
  assert.equal(low[5], 1.0);
  assert.equal(low[8], 1);
  // Ohne Angabe: Defaults des Demos
  const def = tts.buildPayload({ text: 'x' }).data;
  assert.equal(def[5], 2.0);
  assert.equal(def[8], 10);
});

test('parseSseEvents trennt Gradio-SSE-Blöcke in event/data', () => {
  const raw = 'event: generating\ndata: null\n\nevent: complete\ndata: [{"url":"https://x/a.wav"},7]\n\n';
  const events = tts.parseSseEvents(raw);
  assert.equal(events.length, 2);
  assert.equal(events[0].event, 'generating');
  assert.equal(events[1].event, 'complete');
  const payload = JSON.parse(events[1].data);
  assert.equal(payload[0].url, 'https://x/a.wav');
});

test('audioUrlFrom nutzt url direkt und baut sonst aus path + Server', () => {
  assert.equal(tts.audioUrlFrom({ url: 'https://x/a.wav' }, 'https://srv'), 'https://x/a.wav');
  assert.equal(tts.audioUrlFrom({ path: '/tmp/a.wav' }, 'https://srv'), 'https://srv/gradio_api/file=/tmp/a.wav');
  assert.equal(tts.audioUrlFrom(null, 'https://srv'), null);
});

test('Skill-Befehle: server setzen/zurücksetzen und status anzeigen', () => {
  assert.match(registeredSkill.run('server http://localhost:8808'), /localhost:8808/);
  assert.match(registeredSkill.run('status'), /localhost:8808/);
  assert.match(registeredSkill.run('server'), /Demo-Space/);
  assert.match(tts.currentServer(), /hf\.space/);
});
