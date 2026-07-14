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

const dns = require('node:dns').promises;
const net = require('node:net');
const { envValue, accessTokenList, isValidAccessToken, makeRateLimiter } = require('./quantum-shared.js');

const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB Rohdaten-Obergrenze
const MAX_TEXT = 12000;            // an das Prompt-Limit des Gateways angelehnt
const MAX_REDIRECTS = 5;
const withinRateLimit = makeRateLimiter(10, 60000);

/* True für private/loopback/link-local/reservierte IPs (v4 & v6, inkl.
   IPv4-mapped IPv6). SSRF-Kernprüfung. Reine Funktion. */
function isPrivateIp(ip) {
  if (!ip) return true;
  let addr = String(ip);
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) addr = mapped[1];
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;             // link-local + Metadaten
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT
    if (a >= 224) return true;                            // Multicast/reserviert
    return false;
  }
  const low = addr.toLowerCase();
  if (low === '::1' || low === '::' || low === '::0') return true;
  if (low.startsWith('fe8') || low.startsWith('fe9') || low.startsWith('fea') || low.startsWith('feb')) return true; // fe80::/10
  if (low.startsWith('fc') || low.startsWith('fd')) return true;  // ULA fc00::/7
  return net.isIP(addr) ? false : true; // unbekanntes Format → sicherheitshalber sperren
}

/* Nur öffentliche http(s)-URLs zulassen (String-Ebene). Reine Funktion. */
function isPublicHttpUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch (_) { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (net.isIP(host) && isPrivateIp(host)) return false;
  return true;
}

/* Löst den Hostnamen auf und wirft, wenn (irgend)eine Adresse privat ist —
   blockt „Domain zeigt auf interne IP" (DNS-Rebinding im Ruhezustand). */
async function assertResolvesPublic(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw ssrfError();
    return;
  }
  let addrs;
  try { addrs = await dns.lookup(hostname, { all: true }); }
  catch (_) { throw new Error('DNS-Auflösung fehlgeschlagen.'); }
  if (!addrs || !addrs.length) throw new Error('DNS-Auflösung fehlgeschlagen.');
  for (const a of addrs) { if (isPrivateIp(a.address)) throw ssrfError(); }
}

function ssrfError() {
  const e = new Error('Nicht erlaubte (interne) Adresse.');
  e.ssrf = true;
  return e;
}

/* Folgt Redirects MANUELL und prüft jede Ziel-URL + deren aufgelöste IPs,
   bevor überhaupt verbunden wird. Gibt die finale Response zurück. */
async function fetchSafely(startUrl, signal) {
  let current = startUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isPublicHttpUrl(current)) throw ssrfError();
    await assertResolvesPublic(new URL(current).hostname);
    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; QuantumWebReader/1.0)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      if (res.body && typeof res.body.cancel === 'function') { try { await res.body.cancel(); } catch (_) { /* egal */ } }
      continue;
    }
    return { res, finalUrl: current };
  }
  const e = new Error('Zu viele Weiterleitungen.');
  e.tooMany = true;
  throw e;
}

/* Liest den Body inkrementell und bricht bei MAX_BYTES ab, damit ein
   riesiger (chunked) Response die Function nicht überläuft. */
async function readCapped(res, max) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    return text.length > max ? text.slice(0, max) : text;
  }
  const reader = res.body.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.length;
    if (total >= max) { try { await reader.cancel(); } catch (_) { /* egal */ } break; }
  }
  let buf = Buffer.concat(parts.map((p) => Buffer.from(p)));
  if (buf.length > max) buf = buf.slice(0, max);
  return buf.toString('utf8');
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
    const { res, finalUrl } = await fetchSafely(target, controller.signal);
    if (!res.ok) return response(502, { error: 'Seite nicht erreichbar (HTTP ' + res.status + ').' });

    const contentType = String(res.headers.get('content-type') || '');
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
      if (res.body && typeof res.body.cancel === 'function') { try { await res.body.cancel(); } catch (_) { /* egal */ } }
      return response(415, { error: 'Kein lesbarer Text (Content-Type: ' + (contentType || 'unbekannt') + ').' });
    }
    const declaredLength = Number(res.headers.get('content-length') || 0);
    if (declaredLength && declaredLength > MAX_BYTES) return response(413, { error: 'Seite ist zu groß.' });

    const raw = await readCapped(res, MAX_BYTES);
    const { title, text } = htmlToText(raw);
    if (!text) return response(422, { error: 'Auf der Seite wurde kein lesbarer Text gefunden.' });
    const truncated = text.length > MAX_TEXT;
    return response(200, { url: finalUrl, title, text: truncated ? text.slice(0, MAX_TEXT) : text, truncated });
  } catch (error) {
    if (error && error.ssrf) return response(400, { error: 'Weiterleitung/Adresse verweist auf ein internes Ziel.' });
    if (error && error.tooMany) return response(400, { error: 'Zu viele Weiterleitungen.' });
    if (error && /DNS-Auflösung/.test(error.message || '')) return response(502, { error: error.message });
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
exports.isPrivateIp = isPrivateIp;
exports.htmlToText = htmlToText;
