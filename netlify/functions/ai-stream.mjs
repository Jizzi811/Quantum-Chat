/* QUANTUM — Streaming-Gateway (Netlify Functions 2.0).
   Streamt die Antwort des Modells als Server-Sent-Events direkt an den
   Browser durch. Weil die Antwort sofort zu fließen beginnt, greift
   Netlifys 10-Sekunden-Limit für synchrone Functions nicht — lange
   Generierungen (z. B. komplette Browser-Games) werden damit möglich.
   Auth, Rate-Limit und Modell-Fallback identisch zu ai.js. */
import {
  resolveProvider,
  fallbackModels,
  fetchModelIds,
  pickGeminiModel,
  envValue,
  safeEqual,
  makeRateLimiter,
} from './quantum-shared.js';

/* Sicherheitsnetz: bricht hängende Upstreams ab; aktives Streaming einer
   Spielgenerierung liegt weit darunter. */
const STREAM_TIMEOUT_MS = 55000;

const withinRateLimit = makeRateLimiter();

/* Neuere OpenAI-Modelle lehnen max_tokens ab und verlangen
   max_completion_tokens — pro Provider gemerkt, sobald der 400er kommt. */
const tokenParamPreference = {};

export default async function handler(req) {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const config = resolveProvider();
  const accessToken = envValue('QUANTUM_ACCESS_TOKEN');
  if (!config || !accessToken) {
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

  const provider = config.name;
  let model = config.model;

  try {
    let upstream = await callUpstreamAdaptive({ config, model, system, prompt, body, req });

    /* Konfiguriertes Modell wird nicht angenommen (404/410): automatisch
       Alternativen probieren — bei Gemini die andere Namensform
       ("gemini-…" ↔ "models/gemini-…") und das beste Modell aus der
       Modell-Liste (Google sperrt alte Modelle für neue Keys),
       sonst das Default-Modell. */
    if (!upstream.ok && (upstream.status === 404 || upstream.status === 410)) {
      const requestedModel = model;
      const alternates = fallbackModels(config, requestedModel);
      if (config.name === 'gemini') {
        const pick = pickGeminiModel(await fetchModelIds(config));
        if (pick && pick !== requestedModel && !alternates.includes(pick)) alternates.push(pick);
      }
      for (const fallbackModel of alternates) {
        console.error('[quantum-ai-stream] Modell nicht verfügbar, Retry', {
          httpStatus: upstream.status, provider, model, fallback: fallbackModel,
        });
        model = fallbackModel;
        upstream = await callUpstreamAdaptive({ config, model, system, prompt, body, req });
        if (upstream.ok || (upstream.status !== 404 && upstream.status !== 410)) break;
      }
    }

    if (!upstream.ok) {
      const raw = await upstream.text();
      let cause = 'siehe Server-Log';
      try {
        const data = JSON.parse(raw);
        /* Googles OpenAI-kompatibler Endpunkt verpackt Fehler in ein Array
           ([{ error: … }]), alle anderen liefern ein Objekt. */
        const container = Array.isArray(data) ? data[0] : data;
        cause = container?.error?.message || container?.detail || cause;
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

/* Aufruf mit automatischem Parameter-Tausch: lehnt der Provider max_tokens
   mit HTTP 400 ab (neuere OpenAI-Modelle), wird einmal mit
   max_completion_tokens wiederholt und die Präferenz gemerkt. */
async function callUpstreamAdaptive(args) {
  const tokenParam = tokenParamPreference[args.config.name] || 'max_tokens';
  let upstream = await callUpstream({ ...args, tokenParam });
  if (tokenParam === 'max_tokens' && upstream.status === 400) {
    let raw = '';
    try { raw = await upstream.clone().text(); } catch (_) { /* Diagnose optional */ }
    if (/max_completion_tokens/.test(raw)) {
      tokenParamPreference[args.config.name] = 'max_completion_tokens';
      upstream = await callUpstream({ ...args, tokenParam: 'max_completion_tokens' });
    }
  }
  return upstream;
}

/* NVIDIA/Qwen braucht hohe Temperatur samt top_p, alle anderen Provider
   bekommen die gewünschte Temperatur. */
function callUpstream({ config, model, system, prompt, body, req, tokenParam = 'max_tokens' }) {
  return fetch(config.url, {
    method: 'POST',
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    headers: {
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      'Content-Type': 'application/json',
      ...(config.name === 'openrouter' ? {
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
      temperature: config.name === 'nvidia' ? 1.0 : (Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.35),
      ...(config.name === 'nvidia' ? { top_p: 0.95 } : {}),
      [tokenParam]: Math.min(Math.max(Number(body.maxTokens) || 7000, 256), 16000),
    }),
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
