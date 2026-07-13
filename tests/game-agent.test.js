const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE in js/game-agent.js nachbilden.
let registeredSkill = null;
global.window = global;
global.Quantum = {
  skills: { register(def) { registeredSkill = def; } },
  ai: { ask: async () => { throw new Error('ask nicht gemockt'); } },
  modelResponse: require('../js/model-response.js'),
};
global.Blob = class Blob { constructor(parts) { this.parts = parts; } };
global.URL = global.URL || {};
global.URL.createObjectURL = () => 'blob:test';
global.URL.revokeObjectURL = () => {};
window.open = () => ({});

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/game-agent.js'), 'utf8'));

const VALID_GAME_HTML = '<!doctype html><html><body><button id="start">Start</button>'
  + '<script>document.querySelector("#start").onclick=()=>{};<\/script></body></html>';

test('Erfolg: Status "NVIDIA/Qwen erfolgreich" mit Modellname, kein Fallback', async () => {
  Quantum.ai.ask = async () => ({ text: '```html\n' + VALID_GAME_HTML + '\n```', model: 'qwen/qwen3-coder' });
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.match(output, /NVIDIA\/Qwen erfolgreich/);
  assert.match(output, /qwen\/qwen3-coder/);
  assert.ok(!output.includes('lokaler Fallback aktiv'));
  assert.match(output, /Repair Agent: nicht nötig/);
});

test('Fehler beim Aufruf: konkrete Ursache + Modell, Repair Agent läuft automatisch', async () => {
  Quantum.ai.ask = async () => {
    const error = new Error('nvidia-Anfrage fehlgeschlagen (HTTP 429): rate limited');
    error.model = 'nvidia/nemotron-3-super-120b-a12b';
    throw error;
  };
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.match(output, /NVIDIA\/Qwen fehlgeschlagen/);
  assert.match(output, /HTTP 429/);
  assert.match(output, /nemotron/);
  assert.match(output, /lokaler Fallback aktiv/);
  assert.match(output, /Repair Agent: automatisch ausgeführt/);
  assert.ok(!output.includes('Repair Agent: nicht nötig'));
});

test('Unbrauchbare Antwort (kein HTML): Fallback + automatischer Repair Agent', async () => {
  Quantum.ai.ask = async () => ({ text: 'Ich kann leider nur Text liefern.', model: 'qwen/qwen3-coder' });
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.match(output, /kein verwertbares HTML/);
  assert.match(output, /lokaler Fallback aktiv/);
  assert.match(output, /Repair Agent: automatisch ausgeführt/);
  assert.ok(!output.includes('Repair Agent: nicht nötig'));
});

test('Streaming wird bevorzugt; bei Stream-Fehler klassischer Aufruf', async () => {
  let streamCalls = 0;
  let askCalls = 0;
  Quantum.ai.askStream = async () => { streamCalls += 1; throw new Error('Stream kaputt'); };
  Quantum.ai.ask = async () => { askCalls += 1; return { text: VALID_GAME_HTML, model: 'qwen/qwen3.5-122b-a10b' }; };
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.equal(streamCalls, 1, 'Stream wird zuerst versucht');
  assert.equal(askCalls, 1, 'klassischer Aufruf als Fallback');
  assert.match(output, /NVIDIA\/Qwen erfolgreich/);
  delete Quantum.ai.askStream;
});

test('erfolgreicher Stream macht klassischen Aufruf überflüssig', async () => {
  let askCalls = 0;
  Quantum.ai.askStream = async () => ({ text: VALID_GAME_HTML, model: 'qwen/qwen3.5-122b-a10b' });
  Quantum.ai.ask = async () => { askCalls += 1; return { text: VALID_GAME_HTML }; };
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.equal(askCalls, 0);
  assert.match(output, /NVIDIA\/Qwen erfolgreich/);
  delete Quantum.ai.askStream;
});

test('JSON-Antwort mit html-Feld wird als Spiel akzeptiert', async () => {
  Quantum.ai.ask = async () => ({
    text: 'Hier dein Spiel:\n```json\n' + JSON.stringify({ html: VALID_GAME_HTML }) + '\n```',
    model: 'qwen/qwen3-coder',
  });
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.match(output, /NVIDIA\/Qwen erfolgreich/);
  assert.ok(!output.includes('lokaler Fallback aktiv'));
});
