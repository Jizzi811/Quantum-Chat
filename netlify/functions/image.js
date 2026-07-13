/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Bildgeneration (Google Imagen via Gemini API)

   WICHTIG: Diese Function nutzt AUSSCHLIESSLICH die eigene Variable
   GEMINI_IMAGE_API_KEY — niemals GEMINI_API_KEY. So bleibt der Chat
   auf deinem bestehenden Provider (z. B. OpenAI/Custom); der Gemini-
   Key ist ausschließlich für Bilder zuständig.

   Benötigte Netlify-Umgebungsvariablen:
   - GEMINI_IMAGE_API_KEY   (Pflicht)  Google-AI-Studio-Key, nur für Bilder
   - QUANTUM_ACCESS_TOKEN   (Pflicht)  gleicher Zugangscode wie beim Chat
   Optional:
   - GEMINI_IMAGE_MODEL     Default "imagen-3.0-generate-002"
   - QUANTUM_ALLOWED_ORIGIN Origin-Schutz (wie beim Chat-Gateway)
   ═══════════════════════════════════════════════════════════════ */

const { envValue, accessTokenList, isValidAccessToken, makeRateLimiter } = require('./quantum-shared.js');

const UPSTREAM_TIMEOUT_MS = 9000;
const DEFAULT_MODEL = 'imagen-3.0-generate-002';
const withinRateLimit = makeRateLimiter(6, 60000);
const ALLOWED_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

/* Reine Helfer → per Unit-Test abgedeckt. */
function predictUrl(model, key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(key)}`;
}

function buildImageBody({ prompt, aspectRatio }) {
  const ratio = ALLOWED_RATIOS.includes(aspectRatio) ? aspectRatio : '1:1';
  return {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: ratio },
  };
}

/* Zieht das erste Bild als Data-URL aus der Imagen-Antwort. */
function extractImage(data) {
  const prediction = data && Array.isArray(data.predictions) ? data.predictions[0] : null;
  if (!prediction) return null;
  const b64 = prediction.bytesBase64Encoded || prediction.image?.bytesBase64Encoded;
  if (!b64) return null;
  const mime = prediction.mimeType || 'image/png';
  return `data:${mime};base64,${b64}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  const key = envValue('GEMINI_IMAGE_API_KEY');
  if (!key || accessTokenList().length === 0) {
    return response(503, {
      error: 'Bildgeneration ist nicht konfiguriert. Bitte GEMINI_IMAGE_API_KEY (nur für Bilder!) und QUANTUM_ACCESS_TOKEN in Netlify hinterlegen.',
    });
  }

  const origin = event.headers.origin || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
  if (allowedOrigin && origin && origin !== allowedOrigin) return response(403, { error: 'Origin not allowed.' });
  const provided = String(event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!isValidAccessToken(provided)) return response(401, { error: 'Quantum access code is invalid.' });
  if (!withinRateLimit(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown')) {
    return response(429, { error: 'Zu viele Bild-Anfragen. Bitte eine Minute warten.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return response(400, { error: 'Invalid JSON body.' }); }
  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 4000) return response(400, { error: 'Prompt ist leer oder zu lang.' });

  const model = envValue('GEMINI_IMAGE_MODEL') || DEFAULT_MODEL;

  try {
    const upstream = await fetch(predictUrl(model, key), {
      method: 'POST',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildImageBody({ prompt, aspectRatio: body.aspectRatio })),
    });
    const raw = await upstream.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { /* unten */ }

    if (!upstream.ok) {
      const message = (data && (data.error?.message || data.error)) || `HTTP ${upstream.status}`;
      console.error('[quantum-image] Imagen-Fehler', { status: upstream.status, model, message: String(message).slice(0, 300) });
      return response(upstream.status, { error: `Bildgeneration fehlgeschlagen (HTTP ${upstream.status}): ${message}`, model });
    }
    const image = extractImage(data);
    if (!image) {
      console.error('[quantum-image] Kein Bild in Antwort', { model, rawPreview: String(raw).slice(0, 300) });
      return response(502, { error: 'Das Modell hat kein Bild geliefert (evtl. vom Sicherheitsfilter blockiert).', model });
    }
    return response(200, { image, model });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    console.error('[quantum-image] Netzwerkfehler', { model, message: error.message });
    return response(timedOut ? 504 : 502, {
      error: timedOut ? `Zeitlimit erreicht: Das Bildmodell hat nicht innerhalb von ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)} s geantwortet.`
        : (error.message || 'Bilddienst nicht erreichbar.'),
      model,
    });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

module.exports.predictUrl = predictUrl;
module.exports.buildImageBody = buildImageBody;
module.exports.extractImage = extractImage;
