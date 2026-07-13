const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NVIDIA_API_KEY = 'test-nvidia-key-123';
process.env.QUANTUM_ACCESS_TOKEN = 'secret-token';
delete process.env.QUANTUM_ALLOWED_ORIGIN;
delete process.env.NVIDIA_MODEL;

const { handler } = require('../netlify/functions/ai.js');

let ipCounter = 0;
function makeEvent() {
  ipCounter += 1;
  return {
    httpMethod: 'POST',
    headers: {
      authorization: 'Bearer secret-token',
      'x-nf-client-connection-ip': '10.0.0.' + ipCounter,
    },
    body: JSON.stringify({ prompt: 'Baue ein Spiel', system: 'You are a game studio.' }),
  };
}

function mockUpstream({ status = 200, body = '', contentType = 'application/json' }) {
  global.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
  });
}

function captureErrors(fn) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  return fn(logged).finally(() => { console.error = original; });
}

test('nicht-JSON-Antwort (Zahl + Text) crasht nicht und loggt Details ohne API-Key', () =>
  captureErrors(async (logged) => {
    mockUpstream({ status: 200, body: '200 OK but not json', contentType: 'text/plain' });
    const result = await handler(makeEvent());
    assert.equal(result.statusCode, 502);
    const payload = JSON.parse(result.body);
    assert.match(payload.error, /kein gültiges JSON/i);
    assert.ok(payload.model, 'Fehlerantwort nennt das Modell');
    const log = logged.join('\n');
    assert.match(log, /200/, 'HTTP-Status geloggt');
    assert.match(log, /text\/plain/, 'content-type geloggt');
    assert.match(log, /200 OK but not json/, 'Rohantwort-Auszug geloggt');
    assert.match(log, /nemotron|model/i, 'Modell geloggt');
    assert.ok(!log.includes('test-nvidia-key-123'), 'API-Key darf nie geloggt werden');
  }));

test('gültige Antwort mit String-Content wird durchgereicht', async () => {
  mockUpstream({
    status: 200,
    body: JSON.stringify({ model: 'qwen/qwen3-coder', choices: [{ message: { content: '```html\n<html></html>\n```' } }] }),
  });
  const result = await handler(makeEvent());
  assert.equal(result.statusCode, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.text, '```html\n<html></html>\n```');
  assert.equal(payload.model, 'qwen/qwen3-coder');
  assert.equal(payload.provider, 'nvidia');
});

test('content als Array von Parts wird zu Text zusammengefügt', async () => {
  mockUpstream({
    status: 200,
    body: JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: '<html>' }, { type: 'text', text: '</html>' }] } }] }),
  });
  const result = await handler(makeEvent());
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).text, '<html></html>');
});

test('content als bereits geparstes Objekt wird nicht erneut geparst, sondern serialisiert', async () => {
  mockUpstream({
    status: 200,
    body: JSON.stringify({ choices: [{ message: { content: { html: '<html></html>' } } }] }),
  });
  const result = await handler(makeEvent());
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.parse(result.body).text), { html: '<html></html>' });
});

test('Upstream-Fehlerstatus nennt Status, Modell und Ursache', () =>
  captureErrors(async (logged) => {
    mockUpstream({ status: 429, body: JSON.stringify({ error: { message: 'rate limited' } }) });
    const result = await handler(makeEvent());
    assert.equal(result.statusCode, 429);
    const payload = JSON.parse(result.body);
    assert.match(payload.error, /HTTP 429/);
    assert.match(payload.error, /rate limited/);
    assert.ok(payload.model);
    assert.match(logged.join('\n'), /429/);
  }));

test('leerer content liefert klaren Fehler statt Fallback-Rätselraten', () =>
  captureErrors(async () => {
    mockUpstream({ status: 200, body: JSON.stringify({ choices: [{ message: { content: '' } }] }) });
    const result = await handler(makeEvent());
    assert.equal(result.statusCode, 502);
    assert.match(JSON.parse(result.body).error, /keinen Inhalt/i);
  }));

test('Netzwerkfehler wird geloggt und als 502 gemeldet', () =>
  captureErrors(async (logged) => {
    global.fetch = async () => { throw new Error('socket hang up'); };
    const result = await handler(makeEvent());
    assert.equal(result.statusCode, 502);
    assert.match(JSON.parse(result.body).error, /socket hang up/);
    assert.match(logged.join('\n'), /socket hang up/);
  }));
