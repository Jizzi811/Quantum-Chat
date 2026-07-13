const { contentToText } = require('../../js/model-response.js');
const {
  resolveProvider,
  fallbackModels,
  fetchModelIds,
  pickGeminiModel,
  envValue,
  safeEqual,
  makeRateLimiter,
} = require('./quantum-shared.js');

/* Netlify bricht synchrone Functions nach 10 s hart ab (nackter 504 ohne
   JSON). Wir brechen früher selbst ab und liefern eine erklärende Antwort. */
const UPSTREAM_TIMEOUT_MS = 8500;
const withinRateLimit = makeRateLimiter();

/* Merkt sich pro Lambda-Instanz einen funktionierenden Modell-Tausch,
   damit ein totes konfiguriertes Modell nicht jede Anfrage doppelt kostet. */
let modelSwap = null;

/* Neuere OpenAI-Modelle lehnen max_tokens ab und verlangen
   max_completion_tokens — pro Provider gemerkt, sobald der 400er kommt. */
const tokenParamPreference = {};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' });
  }

  const config = resolveProvider();
  const accessToken = envValue('QUANTUM_ACCESS_TOKEN');
  if (!config || !accessToken) {
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

  const provider = config.name;
  let model = config.model;
  if (modelSwap && modelSwap.failed === model) model = modelSwap.works;

  try {
    let attempt = await callUpstreamAdaptive({ config, model, system, prompt, body, event });

    /* Konfiguriertes Modell wird nicht angenommen (404/410): automatisch
       Alternativen probieren (bei Gemini die andere Namensform, sonst das
       Default-Modell) und sich den funktionierenden Tausch für diese
       Lambda-Instanz merken. */
    if (modelGone(attempt)) {
      const requestedModel = model;
      const alternates = fallbackModels(config, requestedModel);
      /* Alle Namensformen und das Default-Modell tot (Google sperrt alte
         Modelle für neue Keys): bestes Modell aus der Liste wählen. */
      if (config.name === 'gemini') {
        const pick = pickGeminiModel(await fetchModelIds(config));
        if (pick && pick !== requestedModel && !alternates.includes(pick)) alternates.push(pick);
      }
      for (const fallbackModel of alternates) {
        logUpstreamIssue({
          status: attempt.upstream.status, model, provider, contentType: attempt.contentType, raw: attempt.raw,
          message: `Modell nicht verfügbar – automatischer Retry mit ${fallbackModel}`,
        });
        attempt = await callUpstreamAdaptive({ config, model: fallbackModel, system, prompt, body, event });
        model = fallbackModel;
        if (attempt.upstream.ok) modelSwap = { failed: requestedModel, works: fallbackModel };
        if (!modelGone(attempt)) break;
      }
    }

    const { upstream, contentType, raw, data, parseError } = attempt;

    if (!upstream.ok) {
      let cause = upstreamErrorMessage(data) || 'siehe Server-Log';
      if (modelGone(attempt) && config.modelsUrl) {
        const available = await suggestModels(config, model);
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
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    logUpstreamIssue({
      status: timedOut ? `Timeout nach ${UPSTREAM_TIMEOUT_MS} ms` : 'kein HTTP-Status (Netzwerkfehler)',
      model,
      provider,
      contentType: 'unbekannt',
      raw: '',
      message: error.message || 'unbekannter Fehler',
    });
    if (timedOut) {
      return response(504, {
        error: `Zeitlimit erreicht: Das Modell hat nicht innerhalb von ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)} s geantwortet. Bitte erneut versuchen oder die Aufgabe kürzer fassen.`,
        model,
        provider,
      });
    }
    return response(502, { error: error.message || 'The configured AI provider is unavailable.', model, provider });
  }
};

/* Aufruf mit automatischem Parameter-Tausch: lehnt der Provider max_tokens
   mit HTTP 400 ab (neuere OpenAI-Modelle), wird einmal mit
   max_completion_tokens wiederholt und die Präferenz gemerkt. */
async function callUpstreamAdaptive(args) {
  const tokenParam = tokenParamPreference[args.config.name] || 'max_tokens';
  let attempt = await callUpstream({ ...args, tokenParam });
  if (tokenParam === 'max_tokens' && attempt.upstream.status === 400
      && /max_completion_tokens/.test(attempt.raw || '')) {
    tokenParamPreference[args.config.name] = 'max_completion_tokens';
    attempt = await callUpstream({ ...args, tokenParam: 'max_completion_tokens' });
  }
  return attempt;
}

/* Führt einen Chat-Completions-Aufruf aus und liest die Antwort abgesichert
   als Text + optional geparstes JSON. NVIDIA/Qwen braucht hohe Temperatur
   samt top_p, alle anderen Provider bekommen die gewünschte Temperatur. */
async function callUpstream({ config, model, system, prompt, body, event, tokenParam = 'max_tokens' }) {
  const upstream = await fetch(config.url, {
    method: 'POST',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: {
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      'Content-Type': 'application/json',
      ...(config.name === 'openrouter' ? {
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
      temperature: config.name === 'nvidia' ? 1.0 : (Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.35),
      ...(config.name === 'nvidia' ? { top_p: 0.95 } : {}),
      [tokenParam]: Math.min(Math.max(Number(body.maxTokens) || 7000, 256), 16000),
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

/* Fehlermeldung aus dem Upstream-Body ziehen. Googles OpenAI-kompatibler
   Endpunkt verpackt Fehler in ein Array ([{ error: … }]), alle anderen
   liefern ein Objekt ({ error: … } bzw. { detail: … }). */
function upstreamErrorMessage(data) {
  const container = Array.isArray(data) ? data[0] : data;
  return container?.error?.message || container?.detail || null;
}

/* Fragt die Modellliste des Providers ab und liefert bis zu acht verfügbare
   IDs — bevorzugt aus derselben Modellfamilie wie das gewünschte Modell. */
async function suggestModels(config, wanted) {
  /* Nur Chat-taugliche Modelle vorschlagen (keine TTS-/Embedding-/Bild-/
     Musik-Varianten) und neueste Versionen zuerst zeigen. */
  const ids = (await fetchModelIds(config))
    .filter((id) => !/(tts|embedding|imagen|veo|audio|live|image|banana|lyria|robotics|learnlm|aqa)/i.test(id))
    .sort().reverse();
  const family = String(wanted).split('/')[0].toLowerCase();
  const sameFamily = ids.filter((id) => id.toLowerCase().startsWith(family + '/'));
  return (sameFamily.length ? sameFamily : ids).slice(0, 8);
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
