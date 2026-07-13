const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NVIDIA_API_KEY = 'test-nvidia-key-123';
process.env.QUANTUM_ACCESS_TOKEN = 'secret-token';
delete process.env.NVIDIA_MODEL;
delete process.env.GROQ_API_KEY;
delete process.env.GROQ_MODEL;
delete process.env.GEMINI_API_KEY;
delete process.env.GEMINI_MODEL;
delete process.env.CUSTOM_AI_URL;
delete process.env.CUSTOM_AI_MODEL;

let ipCounter = 100;
function makeRequest(overrides = {}) {
  ipCounter += 1;
  return new Request('http://localhost/.netlify/functions/ai-stream', {
    method: overrides.method || 'POST',
    headers: {
      authorization: overrides.auth || 'Bearer secret-token',
      'x-nf-client-connection-ip': '10.1.0.' + ipCounter,
      'content-type': 'application/json',
    },
    body: overrides.method === 'GET' ? undefined : JSON.stringify({ prompt: 'Baue ein Spiel' }),
  });
}

async function loadHandler() {
  const mod = await import('../netlify/functions/ai-stream.mjs');
  return mod.default;
}

const SSE_BODY = 'data: {"model":"qwen/qwen3.5-122b-a10b","choices":[{"delta":{"content":"<html>"}}]}\n\n'
  + 'data: {"choices":[{"delta":{"content":"</html>"}}]}\n\n'
  + 'data: [DONE]\n\n';

test('streamt die Upstream-SSE-Antwort unverändert durch', async () => {
  const handler = await loadHandler();
  let sentBody = null;
  global.fetch = async (url, options) => {
    sentBody = JSON.parse(options.body);
    return new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const res = await handler(makeRequest());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  assert.equal(res.headers.get('x-quantum-model'), 'qwen/qwen3.5-122b-a10b');
  assert.equal(sentBody.stream, true);
  assert.equal(await res.text(), SSE_BODY);
});

test('falsche Methode und falscher Token werden abgewiesen', async () => {
  const handler = await loadHandler();
  assert.equal((await handler(makeRequest({ method: 'GET' }))).status, 405);
  assert.equal((await handler(makeRequest({ auth: 'Bearer falsch' }))).status, 401);
});

test('EOL-Modell: Retry mit Default, dann streamen', async () => {
  process.env.NVIDIA_MODEL = 'qwen/totes-modell';
  const handler = await loadHandler();
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.model);
    if (body.model === 'qwen/totes-modell') {
      return new Response(JSON.stringify({ error: { message: 'end of life' } }), { status: 410 });
    }
    return new Response(SSE_BODY, { status: 200 });
  };
  const res = await handler(makeRequest());
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['qwen/totes-modell', 'qwen/qwen3.5-122b-a10b']);
  delete process.env.NVIDIA_MODEL;
});

test('GROQ_API_KEY hat Vorrang: Stream läuft über Groq mit Llama-Default', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key-456';
  try {
    const handler = await loadHandler();
    let sentUrl = null;
    let sentAuth = null;
    global.fetch = async (url, options) => {
      sentUrl = String(url);
      sentAuth = options.headers.Authorization;
      return new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const res = await handler(makeRequest());
    assert.equal(res.status, 200);
    assert.match(sentUrl, /api\.groq\.com\/openai\/v1\/chat\/completions/);
    assert.equal(sentAuth, 'Bearer test-groq-key-456');
    assert.equal(res.headers.get('x-quantum-provider'), 'groq');
    assert.equal(res.headers.get('x-quantum-model'), 'llama-3.3-70b-versatile');
  } finally {
    delete process.env.GROQ_API_KEY;
  }
});

test('Upstream-Fehler wird als JSON mit Ursache und Modell gemeldet', async () => {
  const handler = await loadHandler();
  const originalError = console.error;
  console.error = () => {};
  try {
    global.fetch = async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 });
    const res = await handler(makeRequest());
    assert.equal(res.status, 429);
    const payload = await res.json();
    assert.match(payload.error, /HTTP 429/);
    assert.match(payload.error, /rate limited/);
    assert.ok(payload.model);
  } finally {
    console.error = originalError;
  }
});
