/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Bildgeneration (Gemini Native Image Generation)

   WICHTIG: Diese Function nutzt AUSSCHLIESSLICH die eigene Variable
   GEMINI_IMAGE_API_KEY — niemals GEMINI_API_KEY. So bleibt der Chat
   auf deinem bestehenden Provider (z. B. OpenAI/Custom); der Gemini-
   Key ist ausschließlich für Bilder zuständig.

   Benötigte Netlify-Umgebungsvariablen:
   - GEMINI_IMAGE_API_KEY   (Pflicht)  Google-AI-Studio-Key, nur für Bilder
   - QUANTUM_ACCESS_TOKEN   (Pflicht)  gleicher Zugangscode wie beim Chat
   Optional:
   - GEMINI_IMAGE_MODEL     Default "gemini-3.1-flash-image"
   - QUANTUM_ALLOWED_ORIGIN Origin-Schutz (wie beim Chat-Gateway)
   ═══════════════════════════════════════════════════════════════ */

const { envValue, accessConfigured, isValidAccessCredential, makeRateLimiter } = require('./quantum-shared.js');

const UPSTREAM_TIMEOUT_MS = 60000;
const DEFAULT_MODEL = 'gemini-3.1-flash-image';
/* Höheres Limit als bei Text: das Kurs-Studio erzeugt legitim einen Schwung
   Bilder hintereinander (Cover + je Lektion). Der Client (course-studio.js)
   drosselt zusätzlich und wiederholt bei 429 mit Wartezeit. */
const withinRateLimit = makeRateLimiter(20, 60000);
const ALLOWED_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

/* Reine Helfer → per Unit-Test abgedeckt. */
function generateContentUrl(model, key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
}

/* Alte Imagen-Einstellungen dürfen das neue generateContent-API nicht brechen. */
function resolveModel(configuredModel) {
  const model = String(configuredModel || '').trim();
  return !model || model.startsWith('imagen-') ? DEFAULT_MODEL : model;
}

function buildImageBody({ prompt, aspectRatio }) {
  const ratio = ALLOWED_RATIOS.includes(aspectRatio) ? aspectRatio : '1:1';
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: ratio },
    },
  };
}

/* Zieht das erste Bild als Data-URL aus der Gemini-Antwort. */
function extractImage(data) {
  const candidates = data && Array.isArray(data.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inline = part.inlineData || part.inline_data;
      if (inline && inline.data) {
        const mime = inline.mimeType || inline.mime_type || 'image/png';
        return `data:${mime};base64,${inline.data}`;
      }
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  const key = envValue('GEMINI_IMAGE_API_KEY');
  if (!key || !accessConfigured()) {
    return response(503, {
      error: 'Bildgeneration ist nicht konfiguriert. Bitte GEMINI_IMAGE_API_KEY (nur für Bilder!) und QUANTUM_ACCESS_TOKEN in Netlify hinterlegen.',
    });
  }

  const origin = event.headers.origin || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
  if (allowedOrigin && origin && origin !== allowedOrigin) return response(403, { error: 'Origin not allowed.' });
  const provided = String(event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!isValidAccessCredential(provided)) return response(401, { error: 'Quantum access code is invalid.' });
  if (!withinRateLimit(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown')) {
    return response(429, { error: 'Zu viele Bild-Anfragen. Bitte eine Minute warten.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return response(400, { error: 'Invalid JSON body.' }); }
  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 4000) return response(400, { error: 'Prompt ist leer oder zu lang.' });

  const model = resolveModel(envValue('GEMINI_IMAGE_MODEL'));

  try {
    const upstream = await fetch(generateContentUrl(model, key), {
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
      console.error('[quantum-image] Gemini-Bildfehler', { status: upstream.status, model, message: String(message).slice(0, 300) });
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

module.exports.generateContentUrl = generateContentUrl;
module.exports.resolveModel = resolveModel;
module.exports.buildImageBody = buildImageBody;
module.exports.extractImage = extractImage;
