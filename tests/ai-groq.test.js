const test = require('node:test');
const assert = require('node:assert/strict');

/* Groq ist der bevorzugte Provider: sobald GROQ_API_KEY gesetzt ist,
   gewinnt er gegen einen ebenfalls konfigurierten NVIDIA-Key. */
process.env.GROQ_API_KEY = 'test-groq-key-456';
process.env.NVIDIA_API_KEY = 'test-nvidia-key-123';
process.env.QUANTUM_ACCESS_TOKEN = 'secret-token';
delete process.env.QUANTUM_ALLOWED_ORIGIN;
delete process.env.GROQ_MODEL;
delete process.env.NVIDIA_MODEL;
delete process.env.GEMINI_API_KEY;
delete process.env.GEMINI_MODEL;
delete process.env.CUSTOM_AI_URL;
delete process.env.CUSTOM_AI_MODEL;

const { handler } = require('../netlify/functions/ai.js');
const { resolveProvider } = require('../netlify/functions/quantum-shared.js');

let ipCounter = 0;
function makeEvent(body = {}) {
  ipCounter += 1;
  return {
    httpMethod: 'POST',
    headers: {
      authorization: 'Bearer secret-token',
      'x-nf-client-connection-ip': '10.2.0.' + ipCounter,
    },
    body: JSON.stringify({ prompt: 'Baue ein Spiel', system: 'You are a game studio.', ...body }),
  };
}

function okJson(payload) {
  return {
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(payload),
  };
}

test('GROQ_API_KEY gewinnt gegen NVIDIA: Anfrage geht an api.groq.com mit Llama-Default', async () => {
  let sentUrl = null;
  let sentAuth = null;
  let sentBody = null;
  global.fetch = async (url, options) => {
    sentUrl = String(url);
    sentAuth = options.headers.Authorization;
    sentBody = JSON.parse(options.body);
    return okJson({ model: 'llama-3.3-70b-versatile', choices: [{ message: { content: 'ok' } }] });
  };
  const result = await handler(makeEvent());
  assert.equal(result.statusCode, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.provider, 'groq');
  assert.equal(payload.model, 'llama-3.3-70b-versatile');
  assert.match(sentUrl, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.equal(sentAuth, 'Bearer test-groq-key-456');
  assert.equal(sentBody.model, 'llama-3.3-70b-versatile');
});

test('Groq bekommt die gewünschte Temperatur (kein NVIDIA-Sonderfall mit 1.0/top_p)', async () => {
  let sentBody = null;
  global.fetch = async (url, options) => {
    sentBody = JSON.parse(options.body);
    return okJson({ choices: [{ message: { content: 'ok' } }] });
  };
  const result = await handler(makeEvent({ temperature: 0.45 }));
  assert.equal(result.statusCode, 200);
  assert.equal(sentBody.temperature, 0.45);
  assert.equal(sentBody.top_p, undefined);
});

test('GROQ_MODEL wird respektiert; totes Modell (404) fällt auf den Groq-Default zurück', async () => {
  process.env.GROQ_MODEL = 'llama-tot-70b';
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.model);
    if (body.model === 'llama-tot-70b') {
      return {
        ok: false, status: 404,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: { message: 'model not found' } }),
      };
    }
    return okJson({ model: body.model, choices: [{ message: { content: 'ok' } }] });
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await handler(makeEvent());
    assert.equal(result.statusCode, 200);
    assert.deepEqual(calls, ['llama-tot-70b', 'llama-3.3-70b-versatile']);
    assert.equal(JSON.parse(result.body).model, 'llama-3.3-70b-versatile');
  } finally {
    console.error = originalError;
    delete process.env.GROQ_MODEL;
  }
});

test('GEMINI_API_KEY hat Vorrang vor Groq: Anfrage geht an Googles OpenAI-Endpunkt', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key-789';
  try {
    let sentUrl = null;
    let sentAuth = null;
    let sentBody = null;
    global.fetch = async (url, options) => {
      sentUrl = String(url);
      sentAuth = options.headers.Authorization;
      sentBody = JSON.parse(options.body);
      return okJson({ model: 'gemini-2.5-flash', choices: [{ message: { content: 'ok' } }] });
    };
    const result = await handler(makeEvent({ temperature: 0.6 }));
    assert.equal(result.statusCode, 200);
    const payload = JSON.parse(result.body);
    assert.equal(payload.provider, 'gemini');
    assert.equal(payload.model, 'gemini-2.5-flash');
    assert.equal(sentUrl, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.equal(sentAuth, 'Bearer test-gemini-key-789');
    assert.equal(sentBody.model, 'gemini-2.5-flash');
    assert.equal(sentBody.temperature, 0.6);
  } finally {
    delete process.env.GEMINI_API_KEY;
  }
});

test('Gemini-404 auf der nackten Modell-ID: Retry mit "models/"-Präfix', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key-789';
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.model);
    if (body.model === 'gemini-2.5-flash') {
      return {
        ok: false, status: 404,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: { message: 'model not found for API version v1beta' } }),
      };
    }
    return okJson({ model: body.model, choices: [{ message: { content: 'ok' } }] });
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await handler(makeEvent());
    assert.equal(result.statusCode, 200);
    assert.deepEqual(calls, ['gemini-2.5-flash', 'models/gemini-2.5-flash']);
    assert.equal(JSON.parse(result.body).model, 'models/gemini-2.5-flash');
  } finally {
    console.error = originalError;
    delete process.env.GEMINI_API_KEY;
  }
});

test('CUSTOM_AI_URL hat höchste Priorität (OpenAI-kompatibles Gateway, Key optional)', async () => {
  process.env.CUSTOM_AI_URL = 'https://gateway.example.com/v1';
  process.env.CUSTOM_AI_MODEL = 'router/auto';
  try {
    const config = resolveProvider();
    assert.equal(config.name, 'custom');
    assert.equal(config.url, 'https://gateway.example.com/v1/chat/completions');
    assert.equal(config.modelsUrl, 'https://gateway.example.com/v1/models');
    assert.equal(config.model, 'router/auto');

    let sentUrl = null;
    let sentHeaders = null;
    global.fetch = async (url, options) => {
      sentUrl = String(url);
      sentHeaders = options.headers;
      return okJson({ choices: [{ message: { content: 'ok' } }] });
    };
    const result = await handler(makeEvent());
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).provider, 'custom');
    assert.equal(sentUrl, 'https://gateway.example.com/v1/chat/completions');
    assert.equal(sentHeaders.Authorization, undefined, 'ohne CUSTOM_AI_KEY kein Authorization-Header');
  } finally {
    delete process.env.CUSTOM_AI_URL;
    delete process.env.CUSTOM_AI_MODEL;
  }
});

test('ohne jeden Key meldet das Gateway 503 statt zu raten', async () => {
  const savedGroq = process.env.GROQ_API_KEY;
  const savedNvidia = process.env.NVIDIA_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const result = await handler(makeEvent());
    assert.equal(result.statusCode, 503);
  } finally {
    process.env.GROQ_API_KEY = savedGroq;
    process.env.NVIDIA_API_KEY = savedNvidia;
  }
});
