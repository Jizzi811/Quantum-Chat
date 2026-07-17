/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Websuche (Tavily)
   Sucht über die Tavily-API passende Webseiten zu einer Frage und
   gibt Titel, URL und Kurztext zurück. Das Frontend lässt das
   KI-Gateway (z. B. Hermes) daraus eine Antwort mit Quellen bauen.

   Benötigte Netlify-Umgebungsvariablen:
   - TAVILY_API_KEY         (Pflicht)  Key von tavily.com
   - QUANTUM_ACCESS_TOKEN   (Pflicht)  gleicher Zugangscode wie beim Chat
   Optional:
   - QUANTUM_ALLOWED_ORIGIN Origin-Schutz (wie beim Chat-Gateway)
   ═══════════════════════════════════════════════════════════════ */

const { envValue, accessConfigured, isValidAccessCredential, makeRateLimiter } = require('./quantum-shared.js');

const TAVILY_URL = 'https://api.tavily.com/search';
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_SNIPPET = 600;
const withinRateLimit = makeRateLimiter(10, 60000);

/* Clamp der Ergebnisanzahl. Reine Funktion. */
function clampMax(n) {
  const v = parseInt(n, 10);
  if (!isFinite(v) || v <= 0) return 5;
  return Math.min(Math.max(v, 1), 8);
}

/* Bringt die Tavily-Antwort in eine schlanke, gekappte Form. Reine Funktion. */
function normalizeResults(data, max) {
  const list = data && Array.isArray(data.results) ? data.results : [];
  const results = list.slice(0, max).map((r) => ({
    title: String(r && r.title || '').slice(0, 200),
    url: String(r && r.url || ''),
    content: String(r && r.content || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET),
  })).filter((r) => r.url);
  return { answer: String(data && data.answer || '').trim(), results };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  if (!accessConfigured()) return response(503, { error: 'Quantum access code is not configured in Netlify.' });

  const apiKey = envValue('TAVILY_API_KEY');
  if (!apiKey) return response(503, { error: 'Websuche ist nicht konfiguriert (TAVILY_API_KEY fehlt in Netlify).' });

  const origin = event.headers.origin || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
  if (allowedOrigin && origin !== allowedOrigin) return response(403, { error: 'Origin not allowed.' });
  const provided = String(event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!isValidAccessCredential(provided)) return response(401, { error: 'Quantum access code is invalid.' });
  if (!withinRateLimit(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown')) {
    return response(429, { error: 'Too many search requests. Please wait one minute.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return response(400, { error: 'Invalid JSON body.' }); }
  const query = String(body.query || '').trim();
  if (!query) return response(400, { error: 'No query provided.' });
  if (query.length > 400) return response(400, { error: 'Suchanfrage ist zu lang.' });
  const max = clampMax(body.maxResults);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ query, max_results: max, search_depth: 'basic', include_answer: true }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* unten */ }
    if (res.status === 401 || res.status === 403) return response(502, { error: 'Tavily-Key wird abgelehnt (HTTP ' + res.status + ').' });
    if (!res.ok) return response(502, { error: 'Suchdienst-Fehler (HTTP ' + res.status + ').' });

    const out = normalizeResults(data, max);
    if (!out.results.length && !out.answer) return response(404, { error: 'Keine Suchergebnisse gefunden.' });
    return response(200, { query, ...out });
  } catch (error) {
    const msg = error && error.name === 'AbortError'
      ? 'Zeitlimit überschritten – die Suche hat zu lange gebraucht.'
      : 'Suche konnte nicht ausgeführt werden.';
    return response(502, { error: msg });
  } finally {
    clearTimeout(timer);
  }
};

function response(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}

/* Reine Helfer für Unit-Tests. */
exports.clampMax = clampMax;
exports.normalizeResults = normalizeResults;
