const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE in js/ai-agents.js nachbilden.
const skills = {};
global.window = global;
global.Quantum = {
  skills: { register(def) { skills[def.id] = def; } },
  ai: {},
};
global.Blob = class Blob { constructor(parts) { this.parts = parts; } };
global.URL = global.URL || {};
global.URL.createObjectURL = () => 'blob:test';
global.URL.revokeObjectURL = () => {};
window.open = () => ({});

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/ai-agents.js'), 'utf8'));

const PAGE = '<!doctype html><html><body><h1>Neon Café</h1></body></html>';

test.beforeEach(() => { delete Quantum.ai.askStream; });

test('website: Streaming wird bevorzugt (umgeht das 10-s-Limit)', async () => {
  let streamCalls = 0;
  let askCalls = 0;
  Quantum.ai.askStream = async (args) => {
    streamCalls += 1;
    assert.ok(args.maxTokens >= 9000, 'Streaming bekommt das große Token-Budget');
    return { text: PAGE, model: 'gpt-5.4-mini' };
  };
  Quantum.ai.ask = async () => { askCalls += 1; return { text: PAGE, model: 'gpt-5.4-mini' }; };
  const output = await skills.website.run('Landingpage für ein Café im Neonstil');
  assert.equal(streamCalls, 1);
  assert.equal(askCalls, 0);
  assert.match(output, /gpt-5\.4-mini/);
});

test('website: bei Stream-Fehler klassischer Aufruf als Rückfallebene', async () => {
  Quantum.ai.askStream = async () => { throw new Error('Stream kaputt'); };
  let askCalls = 0;
  Quantum.ai.ask = async () => { askCalls += 1; return { text: PAGE, model: 'gpt-5.4-mini' }; };
  const output = await skills.website.run('Landingpage');
  assert.equal(askCalls, 1);
  assert.match(output, /HOMEPAGE BUILDER/);
});

test('website: unvollständiges HTML wirft verständlichen Fehler', async () => {
  Quantum.ai.askStream = async () => ({ text: 'Hier ein paar Ideen für deine Seite …', model: 'gpt-5.4-mini' });
  Quantum.ai.ask = async () => ({ text: 'Auch nur Text.', model: 'gpt-5.4-mini' });
  await assert.rejects(() => skills.website.run('Landingpage'), /keine vollständige HTML-Seite/);
});

test('team: Planner, Worker und Critic laufen nacheinander, Ausgabe zeigt Plan und finale Fassung', async () => {
  const roles = [];
  Quantum.ai.askStream = async (args) => {
    if (/PLANNER/.test(args.system)) { roles.push('planner'); return { text: '1. Recherche 2. Entwurf 3. Feinschliff', model: 'gpt-5.4-mini' }; }
    if (/WORKER/.test(args.system)) {
      roles.push('worker');
      assert.match(args.prompt, /Recherche/, 'Worker bekommt den Plan des Planners');
      return { text: 'Roh-Ergebnis', model: 'gpt-5.4-mini' };
    }
    roles.push('critic');
    assert.match(args.prompt, /Roh-Ergebnis/, 'Critic bekommt das Worker-Ergebnis');
    return { text: 'Finale, geprüfte Fassung', model: 'gpt-5.4-mini' };
  };
  Quantum.ai.ask = async () => { throw new Error('sollte nicht nötig sein'); };
  const output = await skills.team.run('Businessplan für ein Neon-Café');
  assert.deepEqual(roles, ['planner', 'worker', 'critic']);
  assert.match(output, /AUTOGEN AGENT-TEAM/);
  assert.match(output, /Recherche/);
  assert.match(output, /Finale, geprüfte Fassung/);
});

test('team: ohne Aufgabe kommt eine Bedienungshilfe', async () => {
  const output = await skills.team.run('   ');
  assert.match(output, /skill team/);
});

test('coding: Streaming wird bevorzugt, Antwort nennt das Modell', async () => {
  let streamCalls = 0;
  Quantum.ai.askStream = async () => { streamCalls += 1; return { text: 'Plan + Code', model: 'gpt-5.4-mini' }; };
  Quantum.ai.ask = async () => ({ text: 'Plan + Code', model: 'gpt-5.4-mini' });
  const output = await skills.coding.run('Todo-App in JavaScript');
  assert.equal(streamCalls, 1);
  assert.match(output, /CODING-AGENT/);
  assert.match(output, /gpt-5\.4-mini/);
});
