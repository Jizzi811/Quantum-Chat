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

const VALID_GAME_HTML = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
  + '<body><button id="start">Start</button>'
  + '<script>document.querySelector("#start").onclick=()=>{};<\/script></body></html>';

test.beforeEach(() => { delete Quantum.ai.askStream; });

test('Erfolg: Status nennt Provider (Groq) und Modellname, kein Fallback', async () => {
  Quantum.ai.ask = async () => ({ text: '```html\n' + VALID_GAME_HTML + '\n```', model: 'llama-3.3-70b-versatile', provider: 'groq' });
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.match(output, /Groq erfolgreich/);
  assert.match(output, /llama-3\.3-70b-versatile/);
  assert.ok(!output.includes('lokaler Fallback aktiv'));
  assert.match(output, /Repair Agent: nicht nötig/);
});

test('Fehler beim Aufruf: konkrete Ursache + Modell, Repair Agent läuft automatisch', async () => {
  Quantum.ai.ask = async () => {
    const error = new Error('nvidia-Anfrage fehlgeschlagen (HTTP 429): rate limited');
    error.model = 'nvidia/nemotron-3-super-120b-a12b';
    error.provider = 'nvidia';
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

test('unbrauchbare Antwort zeigt Antwortanfang und finish_reason zur Diagnose', async () => {
  Quantum.ai.askStream = async () => ({
    text: 'Hier sind ein paar Ideen für dein Spiel: 1. Snake …',
    model: 'qwen/qwen3.5-122b-a10b',
    finishReason: 'length',
  });
  Quantum.ai.ask = async () => ({ text: 'Auch nur Text.', model: 'qwen/qwen3.5-122b-a10b' });
  const output = await registeredSkill.run('Snake');
  assert.match(output, /Antwortanfang/);
  assert.match(output, /Hier sind ein paar Ideen/);
  assert.match(output, /length/);
});

test('Antwort mit <think>-Block und HTML dahinter wird akzeptiert', async () => {
  Quantum.ai.askStream = async () => ({
    text: '<think>Snake braucht ein Grid …</think>' + VALID_GAME_HTML,
    model: 'qwen/qwen3.5-122b-a10b',
  });
  const output = await registeredSkill.run('Snake');
  assert.match(output, /KI-Modell erfolgreich/);
  assert.ok(!output.includes('lokaler Fallback aktiv'));
});

test('Streaming wird bevorzugt; bei Stream-Fehler klassischer Aufruf', async () => {
  let streamCalls = 0;
  let askCalls = 0;
  Quantum.ai.askStream = async () => { streamCalls += 1; throw new Error('Stream kaputt'); };
  Quantum.ai.ask = async () => { askCalls += 1; return { text: VALID_GAME_HTML, model: 'qwen/qwen3.5-122b-a10b' }; };
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.equal(streamCalls, 1, 'Stream wird zuerst versucht');
  assert.equal(askCalls, 1, 'klassischer Aufruf als Fallback');
  assert.match(output, /KI-Modell erfolgreich/);
  delete Quantum.ai.askStream;
});

test('erfolgreicher Stream macht klassischen Aufruf überflüssig', async () => {
  let askCalls = 0;
  Quantum.ai.askStream = async () => ({ text: VALID_GAME_HTML, model: 'qwen/qwen3.5-122b-a10b' });
  Quantum.ai.ask = async () => { askCalls += 1; return { text: VALID_GAME_HTML }; };
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.equal(askCalls, 0);
  assert.match(output, /KI-Modell erfolgreich/);
  delete Quantum.ai.askStream;
});

test('review erkennt Syntaxfehler im Inline-Skript (abgeschnittene Spiellogik)', () => {
  const broken = '<!doctype html><html><body><button id="start">Start</button>'
    + '<script>function start(){ if(</script></body></html>';
  const report = Quantum.gameAgent.review(broken);
  assert.equal(report.approved, false);
  assert.ok(report.issues.some((issue) => /JavaScript unvollständig oder fehlerhaft/.test(issue)), report.issues.join('; '));
});

test('KI-Spiel mit kaputtem JavaScript: lokaler Fallback statt toter Hülle oder Ablehnung', async () => {
  const deadShell = '<!doctype html><html><body><h1>Neon Snake</h1><button id="start">Start</button>'
    + '<script>const canvas=document.querySelector("canvas");function loop(){ requestAnimationFrame(</script></body></html>';
  Quantum.ai.ask = async () => ({ text: deadShell, model: 'openai/gpt-oss-120b', provider: 'groq' });
  const output = await registeredSkill.run('Snake im Neon-Style');
  assert.ok(!output.includes('abgelehnt'), 'darf nicht abgelehnt werden:\n' + output);
  assert.match(output, /nicht spielbar/);
  assert.match(output, /lokaler Fallback aktiv/);
  assert.match(output, /openai\/gpt-oss-120b/);
});

test('review verlangt Viewport-Meta, repair rüstet es nach (Handy-Optimierung)', () => {
  const noViewport = '<!doctype html><html><head><title>x</title></head><body><button id="start">Start</button>'
    + '<script>let x=1;</script></body></html>';
  const report = Quantum.gameAgent.review(noViewport);
  assert.equal(report.approved, false);
  assert.ok(report.issues.some((issue) => /viewport/i.test(issue)), report.issues.join('; '));
  const fixed = Quantum.gameAgent.repair(noViewport);
  assert.match(fixed, /<head[^>]*><meta name="viewport"/i);
  assert.equal(Quantum.gameAgent.review(fixed).approved, true);
});

test('repair schließt abgeschnittene script/body/html-Tags und ergänzt den Doctype', () => {
  const fixed = Quantum.gameAgent.repair('<html><body><button id="start">Start</button><script>let x=1;');
  assert.match(fixed, /<\/script><\/body><\/html>$/);
  assert.match(fixed, /^<!doctype html>/i);
});

test('am Token-Limit abgeschnittenes Spiel wird repariert statt abgelehnt', async () => {
  const truncated = '<!doctype html><html><body><button id="start">Start</button><script>let s=0;function start(){s=1}';
  Quantum.ai.askStream = async () => ({ text: truncated, model: 'qwen/qwen3.5-122b-a10b', finishReason: 'length' });
  const output = await registeredSkill.run('Snake wie damals bei Nokia');
  assert.ok(!output.includes('abgelehnt'), 'Spiel darf nicht abgelehnt werden:\n' + output);
  assert.match(output, /Repair Agent: automatisch ausgeführt/);
  assert.match(output, /KI-Modell erfolgreich/);
  delete Quantum.ai.askStream;
});

test('JSON-Antwort mit html-Feld wird als Spiel akzeptiert', async () => {
  Quantum.ai.ask = async () => ({
    text: 'Hier dein Spiel:\n```json\n' + JSON.stringify({ html: VALID_GAME_HTML }) + '\n```',
    model: 'qwen/qwen3-coder',
  });
  const output = await registeredSkill.run('Neon-Reaktionsspiel');
  assert.match(output, /KI-Modell erfolgreich/);
  assert.ok(!output.includes('lokaler Fallback aktiv'));
});
