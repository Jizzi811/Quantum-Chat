/* QUANTUM — Streaming-Gateway (Netlify Functions 2.0).
   Streamt die Antwort des Modells als Server-Sent-Events direkt an den
   Browser durch. Weil die Antwort sofort zu fließen beginnt, greift
   Netlifys 10-Sekunden-Limit für synchrone Functions nicht — lange
   Generierungen (z. B. komplette Browser-Games) werden damit möglich.
   Auth, Rate-Limit und Modell-Fallback identisch zu ai.js. */
import {
  OPENROUTER_URL,
  NVIDIA_URL,
  NVIDIA_DEFAULT_MODEL,
  envValue,
  safeEqual,
  makeRateLimiter,
} from './quantum-shared.js';

/* Sicherheitsnetz: bricht hängende Upstreams ab; aktives Streaming einer
   Spielgenerierung liegt weit darunter. */
const STREAM_TIMEOUT_MS = 55000;

const withinRateLimit = makeRateLimiter();

export default async function handler(req) {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const nvidiaKey = envValue('NVIDIA_API_KEY');
  const openRouterKey = envValue('OPENROUTER_API_KEY');
  const accessToken = envValue('QUANTUM_ACCESS_TOKEN');
  if ((!nvidiaKey && !openRouterKey) || !accessToken) {
    return jsonResponse(503, { error: 'Quantum AI is not fully configured in Netlify.' });
  }

  const origin = req.headers.get('origin') || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
  if (allowedOrigin && origin !== allowedOrigin) return jsonResponse(403, { error: 'Origin not allowed.' });
  const provided = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(provided, accessToken)) return jsonResponse(401, { error: 'Quantum access code is invalid.' });
  if (!withinRateLimit(req.headers.get('x-nf-client-connection-ip') || 'unknown')) {
    return jsonResponse(429, { error: 'Too many AI requests. Please wait one minute.' });
  }

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }
  const prompt = String(body.prompt || '').trim();
  const system = String(body.system || 'You are Quantum, a precise and helpful AI worker.').trim();
  if (!prompt || prompt.length > 50000 || system.length > 12000) {
    return jsonResponse(400, { error: 'Prompt is empty or too long.' });
  }

  const provider = nvidiaKey ? 'nvidia' : 'openrouter';
  const apiKey = nvidiaKey || openRouterKey;
  let model = provider === 'nvidia'
    ? (envValue('NVIDIA_MODEL') || NVIDIA_DEFAULT_MODEL)
    : (envValue('OPENROUTER_MODEL') || 'openrouter/free');

  try {
    let upstream = await callUpstream({ provider, apiKey, model, system, prompt, body, req });

    /* Konfiguriertes Modell existiert nicht mehr (404/410): Retry mit Default. */
    if (!upstream.ok && (upstream.status === 404 || upstream.status === 410)
        && provider === 'nvidia' && model !== NVIDIA_DEFAULT_MODEL) {
      console.error('[quantum-ai-stream] Modell nicht verfügbar, Retry mit Default', {
        httpStatus: upstream.status, provider, model, fallback: NVIDIA_DEFAULT_MODEL,
      });
      model = NVIDIA_DEFAULT_MODEL;
      upstream = await callUpstream({ provider, apiKey, model, system, prompt, body, req });
    }

    if (!upstream.ok) {
      const raw = await upstream.text();
      let cause = 'siehe Server-Log';
      try {
        const data = JSON.parse(raw);
        cause = data.error?.message || data.detail || cause;
      } catch (_) { /* Rohtext bleibt im Log */ }
      console.error('[quantum-ai-stream] Upstream-Problem', {
        httpStatus: upstream.status, provider, model,
        contentType: upstream.headers.get('content-type') || 'unbekannt',
        rawPreview: raw.slice(0, 500),
        error: cause,
      });
      return jsonResponse(upstream.status, {
        error: `${provider}-Anfrage fehlgeschlagen (HTTP ${upstream.status}): ${cause}`,
        model,
        provider,
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Quantum-Model': model,
        'X-Quantum-Provider': provider,
      },
    });
  } catch (error) {
    console.error('[quantum-ai-stream] Fehler', { provider, model, error: error.message });
    return jsonResponse(502, { error: error.message || 'The configured AI provider is unavailable.', model, provider });
  }
}

function callUpstream({ provider, apiKey, model, system, prompt, body, req }) {
  return fetch(provider === 'nvidia' ? NVIDIA_URL : OPENROUTER_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider === 'openrouter' ? {
        'HTTP-Referer': req.headers.get('origin') || req.headers.get('referer') || 'https://quantum.local',
        'X-Title': 'Quantum Neon Chat',
      } : {}),
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: provider === 'nvidia' ? 1.0 : (Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.35),
      ...(provider === 'nvidia' ? { top_p: 0.95 } : {}),
      max_tokens: Math.min(Math.max(Number(body.maxTokens) || 7000, 256), 12000),
    }),
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
