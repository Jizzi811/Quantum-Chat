/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Web-Reader
   Lädt eine öffentliche Webseite serverseitig, extrahiert den
   lesbaren Text und gibt ihn zurück. Das Frontend füttert den Text
   anschließend ins KI-Gateway (z. B. Hermes), damit das Modell die
   Seite zusammenfassen oder Fragen dazu beantworten kann.

   Benötigte Netlify-Umgebungsvariablen:
   - QUANTUM_ACCESS_TOKEN   (Pflicht)  gleicher Zugangscode wie beim Chat
   Optional:
   - QUANTUM_ALLOWED_ORIGIN Origin-Schutz (wie beim Chat-Gateway)
   ═══════════════════════════════════════════════════════════════ */

const { envValue, accessTokenList, isValidAccessToken, makeRateLimiter } = require('./quantum-shared.js');

const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB Rohdaten-Obergrenze
const MAX_TEXT = 12000;            // an das Prompt-Limit des Gateways angelehnt
const withinRateLimit = makeRateLimiter(10, 60000);

/* Nur öffentliche http(s)-URLs zulassen — blockt localhost, private
   Netze und die Cloud-Metadaten-IP (SSRF-Schutz). Reine Funktion. */
function isPublicHttpUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch (_) { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === '::1' || host === '0.0.0.0') return false;
  /* IPv4-Literale in privaten/reservierten Bereichen abweisen. */
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;            // link-local + Metadaten
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;  // CGNAT
  }
  return true;
}

/* Grobe, abhängigkeitsfreie HTML→Text-Extraktion. Reine Funktion. */
function htmlToText(html) {
  const raw = String(html || '');
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
  let text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (_) { return ''; } });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  if (accessTokenList().length === 0) return response(503, { error: 'Quantum access code is not configured in Netlify.' });

  const origin = event.headers.origin || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
  if (allowedOrigin && origin !== allowedOrigin) return response(403, { error: 'Origin not allowed.' });
  const provided = String(event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!isValidAccessToken(provided)) return response(401, { error: 'Quantum access code is invalid.' });
  if (!withinRateLimit(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown')) {
    return response(429, { error: 'Too many browse requests. Please wait one minute.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return response(400, { error: 'Invalid JSON body.' }); }
  const target = String(body.url || '').trim();
  if (!target) return response(400, { error: 'No URL provided.' });
  if (!isPublicHttpUrl(target)) return response(400, { error: 'Nur öffentliche http(s)-Adressen sind erlaubt.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; QuantumWebReader/1.0)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    });
    if (!res.ok) return response(502, { error: 'Seite nicht erreichbar (HTTP ' + res.status + ').' });

    const finalUrl = res.url || target;
    if (!isPublicHttpUrl(finalUrl)) return response(400, { error: 'Weiterleitung auf eine nicht erlaubte Adresse.' });
    const contentType = String(res.headers.get('content-type') || '');
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
      return response(415, { error: 'Kein lesbarer Text (Content-Type: ' + (contentType || 'unbekannt') + ').' });
    }
    const declaredLength = Number(res.headers.get('content-length') || 0);
    if (declaredLength && declaredLength > MAX_BYTES) return response(413, { error: 'Seite ist zu groß.' });

    const raw = await res.text();
    const { title, text } = htmlToText(raw.slice(0, MAX_BYTES));
    if (!text) return response(422, { error: 'Auf der Seite wurde kein lesbarer Text gefunden.' });
    const truncated = text.length > MAX_TEXT;
    return response(200, { url: finalUrl, title, text: truncated ? text.slice(0, MAX_TEXT) : text, truncated });
  } catch (error) {
    const msg = error && error.name === 'AbortError'
      ? 'Zeitlimit überschritten – die Seite hat zu lange gebraucht.'
      : 'Seite konnte nicht geladen werden.';
    return response(502, { error: msg });
  } finally {
    clearTimeout(timer);
  }
};

function response(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}

/* Reine Helfer für Unit-Tests. */
exports.isPublicHttpUrl = isPublicHttpUrl;
exports.htmlToText = htmlToText;
