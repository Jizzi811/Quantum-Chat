/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Echte Video-Generierung (LongCat-Video über fal.ai)
   Proxyt Text→Video an fal.ai (Modell meituan-longcat/LongCat-Video,
   MIT-Lizenz). fal nutzt eine Queue: erst absenden (request_id),
   dann Status pollen, am Ende die Video-URL abholen. Der FAL_KEY
   bleibt serverseitig; ohne Key ist die Funktion inaktiv (503).

   Benötigte Netlify-Umgebungsvariablen:
   - FAL_KEY                (Pflicht)  Key von fal.ai  → sonst 503
   - QUANTUM_ACCESS_TOKEN   (Pflicht)  gleicher Zugangscode wie beim Chat
   Optional:
   - QUANTUM_ALLOWED_ORIGIN Origin-Schutz (wie beim Chat-Gateway)

   ⚠️ Kostenhinweis: fal berechnet ~$0.04 pro erzeugter Videosekunde.
   ═══════════════════════════════════════════════════════════════ */

const { envValue, accessTokenList, isValidAccessToken, makeRateLimiter } = require('./quantum-shared.js');

const FAL_BASE = 'https://queue.fal.run/fal-ai/longcat-video';
const SUBMIT_URL = FAL_BASE + '/text-to-video/720p';
const SUBMIT_TIMEOUT_MS = 15000;
const STATUS_TIMEOUT_MS = 9000;
const withinRateLimit = makeRateLimiter(20, 60000);

/* Baut den fal-Input aus dem Request-Body. Reine Funktion. */
function buildInput(body) {
  const prompt = String(body && body.prompt || '').trim();
  return { prompt: prompt };
}

/* Prüft eine fal request_id (UUID-artig) — schützt die URL vor Injection. Reine Funktion. */
function isValidRequestId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(id);
}

function statusUrl(id) { return FAL_BASE + '/requests/' + id + '/status'; }
function resultUrl(id) { return FAL_BASE + '/requests/' + id; }

/* Liest die request_id aus der fal-Submit-Antwort. Reine Funktion. */
function parseSubmit(data) {
  const id = data && (data.request_id || data.requestId);
  return isValidRequestId(id) ? id : null;
}

/* Normiert den fal-Status. Reine Funktion. */
function parseStatus(data) {
  const status = String(data && data.status || '').toUpperCase();
  return { status: status || 'UNKNOWN', done: status === 'COMPLETED' };
}

/* Holt die Video-URL aus der fal-Ergebnisantwort (verschiedene Formen). Reine Funktion. */
function parseResult(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.video && data.video.url) return String(data.video.url);
  if (data.video_url) return String(data.video_url);
  if (Array.isArray(data.videos) && data.videos[0] && data.videos[0].url) return String(data.videos[0].url);
  if (data.output && data.output.video && data.output.video.url) return String(data.output.video.url);
  return null;
}

async function falFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, Object.assign({ signal: controller.signal }, options));
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  if (accessTokenList().length === 0) return response(503, { error: 'Quantum access code is not configured in Netlify.' });

  const apiKey = envValue('FAL_KEY');
  if (!apiKey) return response(503, { error: 'Video-Generierung ist nicht konfiguriert (FAL_KEY fehlt in Netlify).' });

  const origin = event.headers.origin || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
  if (allowedOrigin && origin !== allowedOrigin) return response(403, { error: 'Origin not allowed.' });
  const provided = String(event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!isValidAccessToken(provided)) return response(401, { error: 'Quantum access code is invalid.' });
  if (!withinRateLimit(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown')) {
    return response(429, { error: 'Zu viele Video-Anfragen. Bitte eine Minute warten.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return response(400, { error: 'Invalid JSON body.' }); }
  const action = String(body.action || 'submit');
  const auth = { Authorization: 'Key ' + apiKey };

  try {
    if (action === 'status') {
      const id = body.request_id;
      if (!isValidRequestId(id)) return response(400, { error: 'Ungültige request_id.' });
      const statusRes = await falFetch(statusUrl(id), { headers: auth }, STATUS_TIMEOUT_MS);
      let statusData = {};
      try { statusData = await statusRes.json(); } catch (_) { /* unten */ }
      if (statusRes.status === 401 || statusRes.status === 403) return response(502, { error: 'fal-Key wird abgelehnt.' });
      if (!statusRes.ok) return response(502, { error: 'fal-Statusfehler (HTTP ' + statusRes.status + ').' });

      const st = parseStatus(statusData);
      if (!st.done) return response(200, { status: st.status });

      const resultRes = await falFetch(resultUrl(id), { headers: auth }, STATUS_TIMEOUT_MS);
      let resultData = {};
      try { resultData = await resultRes.json(); } catch (_) { /* unten */ }
      if (!resultRes.ok) return response(502, { error: 'fal-Ergebnisfehler (HTTP ' + resultRes.status + ').' });
      const videoUrl = parseResult(resultData);
      if (!videoUrl) return response(502, { error: 'fal lieferte kein Video-Ergebnis.' });
      return response(200, { status: 'COMPLETED', video_url: videoUrl });
    }

    /* action === 'submit' */
    const input = buildInput(body);
    if (!input.prompt) return response(400, { error: 'Kein Prompt angegeben.' });
    if (input.prompt.length > 1500) return response(400, { error: 'Prompt ist zu lang (max. 1500 Zeichen).' });

    const submitRes = await falFetch(SUBMIT_URL, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify(input),
    }, SUBMIT_TIMEOUT_MS);
    let submitData = {};
    try { submitData = await submitRes.json(); } catch (_) { /* unten */ }
    if (submitRes.status === 401 || submitRes.status === 403) return response(502, { error: 'fal-Key wird abgelehnt.' });
    if (submitRes.status === 422) return response(502, { error: 'fal lehnt die Eingabe ab (422).' });
    if (!submitRes.ok) return response(502, { error: 'fal-Submit-Fehler (HTTP ' + submitRes.status + ').' });

    const requestId = parseSubmit(submitData);
    if (!requestId) return response(502, { error: 'fal lieferte keine request_id.' });
    return response(200, { status: 'IN_QUEUE', request_id: requestId });
  } catch (error) {
    const msg = error && error.name === 'AbortError'
      ? 'Zeitlimit gegenüber fal überschritten.'
      : 'Video-Dienst nicht erreichbar.';
    return response(502, { error: msg });
  }
};

function response(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}

/* Reine Helfer für Unit-Tests. */
exports.buildInput = buildInput;
exports.isValidRequestId = isValidRequestId;
exports.parseSubmit = parseSubmit;
exports.parseStatus = parseStatus;
exports.parseResult = parseResult;
exports.statusUrl = statusUrl;
exports.resultUrl = resultUrl;
exports.SUBMIT_URL = SUBMIT_URL;
