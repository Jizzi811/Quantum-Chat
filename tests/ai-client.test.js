const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE in js/ai-client.js nachbilden.
global.window = global;
global.Quantum = global.Quantum || {};
global.sessionStorage = {
  store: { 'quantum.ai.access': 'secret-token' },
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = value; },
  removeItem(key) { delete this.store[key]; },
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/ai-client.js'), 'utf8'));

const SSE_BODY = 'data: {"model":"qwen/qwen3.5-122b-a10b","choices":[{"delta":{"content":"<html>"}}]}\n\n'
  + 'data: {"choices":[{"delta":{"content":"<body>x</body>"}}]}\n\n'
  + 'data: {"choices":[{"delta":{"content":"</html>"}}]}\n\n'
  + 'data: [DONE]\n\n';

test('askStream setzt SSE-Deltas zur vollständigen Antwort zusammen', async () => {
  global.fetch = async (url) => {
    assert.equal(url, '/.netlify/functions/ai-stream');
    return new Response(SSE_BODY, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-quantum-model': 'qwen/qwen3.5-122b-a10b' },
    });
  };
  const deltas = [];
  const result = await Quantum.ai.askStream({ prompt: 'baue ein spiel', onDelta: (t) => deltas.push(t) });
  assert.equal(result.text, '<html><body>x</body></html>');
  assert.equal(result.model, 'qwen/qwen3.5-122b-a10b');
  assert.equal(deltas.length, 3);
  assert.equal(deltas[2], '<html><body>x</body></html>');
});

test('askStream meldet finish_reason "length" (Token-Limit erreicht)', async () => {
  const body = 'data: {"choices":[{"delta":{"content":"abc"},"finish_reason":null}]}\n\n'
    + 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'
    + 'data: [DONE]\n\n';
  global.fetch = async () => new Response(body, { status: 200 });
  const result = await Quantum.ai.askStream({ prompt: 'test' });
  assert.equal(result.text, 'abc');
  assert.equal(result.finishReason, 'length');
});

test('askStream wirft mit Ursache und Modell bei Fehlerantwort', async () => {
  global.fetch = async () => new Response(
    JSON.stringify({ error: 'nvidia-Anfrage fehlgeschlagen (HTTP 429): rate limited', model: 'qwen/qwen3.5-122b-a10b' }),
    { status: 429, headers: { 'content-type': 'application/json' } },
  );
  await assert.rejects(
    Quantum.ai.askStream({ prompt: 'test' }),
    (error) => /HTTP 429/.test(error.message) && error.model === 'qwen/qwen3.5-122b-a10b',
  );
});

test('askStream wirft bei leerem Stream', async () => {
  global.fetch = async () => new Response('data: [DONE]\n\n', { status: 200 });
  await assert.rejects(Quantum.ai.askStream({ prompt: 'test' }), /keinen Inhalt/);
});

test('askStream erklärt, wenn das Modell nur Reasoning ohne Antwort liefert', async () => {
  const body = 'data: {"choices":[{"delta":{"reasoning_content":"Ich denke nach …"},"finish_reason":null}]}\n\n'
    + 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'
    + 'data: [DONE]\n\n';
  global.fetch = async () => new Response(body, { status: 200 });
  await assert.rejects(Quantum.ai.askStream({ prompt: 'test' }), /nur gedacht/);
});
