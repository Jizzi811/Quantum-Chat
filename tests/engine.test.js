const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE in js/engine.js nachbilden.
global.window = global;
let askCalls = [];
let askImpl = async () => ({ text: 'Antwort', model: 'qwen/qwen3-coder' });
let hasAccessValue = true;
let calcCalls = [];

global.Quantum = {
  modelResponse: require('../js/model-response.js'),
  ai: {
    hasAccess: () => hasAccessValue,
    ask: (args) => { askCalls.push(args); return askImpl(args); },
  },
  skills: {
    all: [],
    isEnabled: () => true,
    run: (id, input) => { calcCalls.push({ id, input }); return '= 8'; },
  },
  automations: { all: () => [] },
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8'));

test.beforeEach(() => { askCalls = []; calcCalls = []; hasAccessValue = true; });

test('freie Frage geht mit KI-Zugang an NVIDIA und Codeblock wird bereinigt', async () => {
  askImpl = async () => ({ text: '```\nQuarks sind Elementarteilchen.\n```', model: 'qwen/qwen3-coder' });
  const answer = await Quantum.engine.respond('Was ist ein Quark?');
  assert.equal(askCalls.length, 1);
  assert.match(askCalls[0].prompt, /Was ist ein Quark\?/);
  assert.equal(answer, 'Quarks sind Elementarteilchen.');
});

test('NVIDIA-Fehler zeigt konkrete Ursache plus lokale Antwort', async () => {
  askImpl = async () => { throw new Error('nvidia-Anfrage fehlgeschlagen (HTTP 502): kein Inhalt'); };
  const answer = await Quantum.engine.respond('Erkläre mir Neutronensterne');
  assert.match(answer, /NVIDIA\/Qwen nicht erreichbar/);
  assert.match(answer, /HTTP 502/);
  assert.match(answer, /Lokale Antwort:/);
});

test('ohne KI-Zugang bleibt es lokal und der Tipp erscheint', async () => {
  hasAccessValue = false;
  const answer = await Quantum.engine.respond('Erkläre mir bitte Schwarze Löcher im Detail');
  assert.equal(askCalls.length, 0);
  assert.match(answer, /🔑/);
});

test('Befehle bleiben auch mit KI-Zugang lokal', async () => {
  const answer = await Quantum.engine.respond('/help');
  assert.equal(askCalls.length, 0);
  assert.match(answer, /QUANTUM-BEFEHLE/);
});

test('reine Rechenausdrücke werden lokal gelöst, nicht an die KI geschickt', async () => {
  const answer = await Quantum.engine.respond('5+3');
  assert.equal(askCalls.length, 0);
  assert.equal(calcCalls.length, 1);
  assert.equal(answer, '= 8');
});

test('Verlauf wandert in den Prompt der Folgefrage', async () => {
  askImpl = async () => ({ text: 'Erste Antwort' });
  await Quantum.engine.respond('Erste Frage zur Quantenphysik');
  Quantum.bus.emit('botmessage', 'Erste Antwort');
  askImpl = async () => ({ text: 'Zweite Antwort' });
  await Quantum.engine.respond('Und wie hängt das zusammen?');
  const prompt = askCalls[askCalls.length - 1].prompt;
  assert.match(prompt, /Erste Frage zur Quantenphysik/);
  assert.match(prompt, /Quantum: Erste Antwort/);
  assert.match(prompt, /Und wie hängt das zusammen\?/);
});
