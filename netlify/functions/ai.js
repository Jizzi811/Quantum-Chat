const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
const requests = new Map();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' });
  }

  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const accessToken = process.env.QUANTUM_ACCESS_TOKEN;
  if ((!nvidiaKey && !openRouterKey) || !accessToken) {
    return response(503, { error: 'Quantum AI is not fully configured in Netlify.' });
  }

  const origin = event.headers.origin || '';
  const allowedOrigin = process.env.QUANTUM_ALLOWED_ORIGIN || '';
  if (allowedOrigin && origin !== allowedOrigin) return response(403, { error: 'Origin not allowed.' });
  const provided = String(event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(provided, accessToken)) return response(401, { error: 'Quantum access code is invalid.' });
  if (!withinRateLimit(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown')) {
    return response(429, { error: 'Too many AI requests. Please wait one minute.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return response(400, { error: 'Invalid JSON body.' });
  }

  const prompt = String(body.prompt || '').trim();
  const system = String(body.system || 'You are Quantum, a precise and helpful AI worker.').trim();
  if (!prompt || prompt.length > 50000 || system.length > 12000) {
    return response(400, { error: 'Prompt is empty or too long.' });
  }

  try {
    const provider = nvidiaKey ? 'nvidia' : 'openrouter';
    const apiKey = nvidiaKey || openRouterKey;
    const model = provider === 'nvidia'
      ? (process.env.NVIDIA_MODEL || NVIDIA_DEFAULT_MODEL)
      : (process.env.OPENROUTER_MODEL || 'openrouter/free');
    const upstream = await fetch(provider === 'nvidia' ? NVIDIA_URL : OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter' ? {
          'HTTP-Referer': event.headers.origin || event.headers.referer || 'https://quantum.local',
          'X-Title': 'Quantum Neon Chat',
        } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: provider === 'nvidia' ? 1.0 : (Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.35),
        ...(provider === 'nvidia' ? { top_p: 0.95 } : {}),
        max_tokens: Math.min(Math.max(Number(body.maxTokens) || 7000, 256), 12000),
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return response(upstream.status, { error: data.error?.message || `${provider} request failed.` });
    }
    const text = data.choices?.[0]?.message?.content;
    if (!text) return response(502, { error: 'The model returned no content.' });
    return response(200, { text, model: data.model || model, provider });
  } catch (error) {
    return response(502, { error: error.message || 'The configured AI provider is unavailable.' });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function safeEqual(a, b) {
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function withinRateLimit(ip) {
  const now = Date.now();
  const recent = (requests.get(ip) || []).filter((time) => now - time < 60000);
  if (recent.length >= 10) return false;
  recent.push(now);
  requests.set(ip, recent);
  return true;
}
