const { contentToText } = require('../../js/model-response.js');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODELS_URL = 'https://integrate.api.nvidia.com/v1/models';
const NVIDIA_DEFAULT_MODEL = 'qwen/qwen3.5-122b-a10b';
const requests = new Map();

/* Merkt sich pro Lambda-Instanz einen funktionierenden Modell-Tausch,
   damit ein totes konfiguriertes Modell nicht jede Anfrage doppelt kostet. */
let modelSwap = null;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' });
  }

  const nvidiaKey = envValue('NVIDIA_API_KEY');
  const openRouterKey = envValue('OPENROUTER_API_KEY');
  const accessToken = envValue('QUANTUM_ACCESS_TOKEN');
  if ((!nvidiaKey && !openRouterKey) || !accessToken) {
    return response(503, { error: 'Quantum AI is not fully configured in Netlify.' });
  }

  const origin = event.headers.origin || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
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
    let model = provider === 'nvidia'
      ? (envValue('NVIDIA_MODEL') || NVIDIA_DEFAULT_MODEL)
      : (envValue('OPENROUTER_MODEL') || 'openrouter/free');
    if (modelSwap && modelSwap.failed === model) model = modelSwap.works;

    let attempt = await callUpstream({ provider, apiKey, model, system, prompt, body, event });

    /* Konfiguriertes Modell existiert nicht mehr (404) oder ist End-of-Life
       (410): einmal automatisch mit dem Default-Modell erneut versuchen und
       sich den funktionierenden Tausch für diese Lambda-Instanz merken. */
    if (modelGone(attempt) && provider === 'nvidia' && model !== NVIDIA_DEFAULT_MODEL) {
      logUpstreamIssue({
        status: attempt.upstream.status, model, provider, contentType: attempt.contentType, raw: attempt.raw,
        message: `Modell nicht mehr verfügbar – automatischer Retry mit ${NVIDIA_DEFAULT_MODEL}`,
      });
      const retry = await callUpstream({ provider, apiKey, model: NVIDIA_DEFAULT_MODEL, system, prompt, body, event });
      if (retry.upstream.ok) modelSwap = { failed: model, works: NVIDIA_DEFAULT_MODEL };
      attempt = retry;
      model = NVIDIA_DEFAULT_MODEL;
    }

    const { upstream, contentType, raw, data, parseError } = attempt;

    if (!upstream.ok) {
      let cause = data?.error?.message || data?.detail || 'siehe Server-Log';
      if (modelGone(attempt) && provider === 'nvidia') {
        const available = await suggestModels(apiKey, model);
        if (available.length) cause += ` — verfügbare Modelle z. B.: ${available.join(', ')}`;
      }
      logUpstreamIssue({ status: upstream.status, model, provider, contentType, raw, message: cause });
      return response(upstream.status, {
        error: `${provider}-Anfrage fehlgeschlagen (HTTP ${upstream.status}): ${cause}`,
        model,
        provider,
      });
    }
    if (!data || typeof data !== 'object') {
      logUpstreamIssue({
        status: upstream.status, model, provider, contentType, raw,
        message: parseError ? parseError.message : 'Leerer Antwort-Body',
      });
      return response(502, {
        error: `Antwort von ${provider} war kein gültiges JSON (content-type: ${contentType}).`,
        model,
        provider,
      });
    }

    const text = normalizeContent(data.choices?.[0]?.message?.content);
    if (!text) {
      logUpstreamIssue({
        status: upstream.status, model: data.model || model, provider, contentType, raw,
        message: 'Das Modell hat keinen Inhalt geliefert (choices[0].message.content leer).',
      });
      return response(502, { error: 'Das Modell hat keinen Inhalt geliefert.', model: data.model || model, provider });
    }
    return response(200, { text, model: data.model || model, provider });
  } catch (error) {
    logUpstreamIssue({
      status: 'kein HTTP-Status (Netzwerkfehler)',
      model: envValue('NVIDIA_MODEL') || NVIDIA_DEFAULT_MODEL,
      provider: nvidiaKey ? 'nvidia' : 'openrouter',
      contentType: 'unbekannt',
      raw: '',
      message: error.message || 'unbekannter Fehler',
    });
    return response(502, { error: error.message || 'The configured AI provider is unavailable.' });
  }
};

/* Führt einen Chat-Completions-Aufruf aus und liest die Antwort abgesichert
   als Text + optional geparstes JSON. */
async function callUpstream({ provider, apiKey, model, system, prompt, body, event }) {
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
  const contentType = upstream.headers.get('content-type') || 'unbekannt';
  const raw = await upstream.text();
  let data = null;
  let parseError = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (error) {
    parseError = error;
  }
  return { upstream, contentType, raw, data, parseError };
}

// 404 = Modell unbekannt, 410 = Modell End-of-Life
function modelGone(attempt) {
  return !attempt.upstream.ok && (attempt.upstream.status === 404 || attempt.upstream.status === 410);
}

/* Fragt NVIDIAs Modellliste ab und liefert bis zu acht verfügbare IDs —
   bevorzugt aus derselben Modellfamilie wie das gewünschte Modell. */
async function suggestModels(apiKey, wanted) {
  try {
    const res = await fetch(NVIDIA_MODELS_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return [];
    const data = JSON.parse(await res.text());
    const ids = (data.data || []).map((entry) => entry.id).filter(Boolean);
    const family = String(wanted).split('/')[0].toLowerCase();
    const sameFamily = ids.filter((id) => id.toLowerCase().startsWith(family + '/'));
    return (sameFamily.length ? sameFamily : ids).slice(0, 8);
  } catch (_) {
    return [];
  }
}

/* Liest eine Umgebungsvariable und bereinigt typische Paste-Fehler aus dem
   Netlify-UI: der Variablenname landet mit im Wert ("NVIDIA_MODEL=qwen/…"),
   umschließende Anführungszeichen oder Leerzeichen. */
function envValue(name) {
  let value = String(process.env[name] || '').trim();
  if (value.toUpperCase().startsWith(name.toUpperCase() + '=')) {
    value = value.slice(name.length + 1).trim();
  }
  value = value.replace(/^["']+|["']+$/g, '').trim();
  return value;
}

// content kann String, Array von Parts oder bereits geparstes Objekt sein.
// Objekte werden serialisiert statt sie später erneut durch JSON.parse zu jagen.
function normalizeContent(content) {
  if (content === null || content === undefined) return '';
  const text = contentToText(content);
  if (text !== null) return text.trim();
  try {
    return JSON.stringify(content);
  } catch (_) {
    return '';
  }
}

// Loggt Diagnosedaten serverseitig (Netlify Function Log). Niemals den API-Key.
function logUpstreamIssue({ status, model, provider, contentType, raw, message }) {
  console.error('[quantum-ai] Upstream-Problem', {
    httpStatus: status,
    provider,
    model,
    contentType,
    rawPreview: String(raw || '').slice(0, 500),
    error: message,
  });
}

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
