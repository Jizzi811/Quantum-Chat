/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Zahlung verifizieren & Zugang freischalten

   Nach erfolgreichem Stripe-Checkout kehrt der Nutzer mit der
   session_id zurück. Diese Function fragt die Session bei Stripe ab
   und gibt — NUR wenn die Session nachweislich bezahlt/abgeschlossen
   ist — den Zugangscode (QUANTUM_ACCESS_TOKEN) zurück. So ist der
   Zugang an eine echte Zahlung gebunden, ohne Datenbank/E-Mail.

   Benötigt: STRIPE_SECRET_KEY, QUANTUM_ACCESS_TOKEN
   Optional:  QUANTUM_ALLOWED_ORIGIN
   ═══════════════════════════════════════════════════════════════ */

const { envValue, accessTokenList, makeRateLimiter } = require('./quantum-shared.js');

const UPSTREAM_TIMEOUT_MS = 8500;
const withinRateLimit = makeRateLimiter(15, 60000);

/* Prüft, ob eine Stripe-Checkout-Session als bezahlt gilt. Reine Funktion.
   Bei Abos ohne Sofortzahlung (Trial) liefert Stripe payment_status
   'no_payment_required' — das zählt hier als gültig freigeschaltet. */
function isSessionPaid(session) {
  if (!session || typeof session !== 'object') return false;
  const complete = session.status === 'complete';
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  return complete && paid;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  const secret = envValue('STRIPE_SECRET_KEY');
  const accessToken = accessTokenList()[0];
  if (!secret || !accessToken) {
    return response(503, { error: 'Zahlungs-Freischaltung ist nicht konfiguriert (STRIPE_SECRET_KEY / QUANTUM_ACCESS_TOKEN fehlen).' });
  }

  const origin = event.headers.origin || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
  if (allowedOrigin && origin && origin !== allowedOrigin) return response(403, { error: 'Origin not allowed.' });
  if (!withinRateLimit(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown')) {
    return response(429, { error: 'Zu viele Anfragen. Bitte kurz warten.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return response(400, { error: 'Invalid JSON body.' }); }
  const sessionId = String(body.sessionId || '').trim();
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return response(400, { error: 'Ungültige Session-ID.' });

  try {
    const upstream = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${secret}` },
    });
    const raw = await upstream.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { /* unten */ }

    if (!upstream.ok) {
      const message = (data && data.error && data.error.message) || `HTTP ${upstream.status}`;
      console.error('[quantum-verify] Stripe-Fehler', { status: upstream.status, message });
      return response(502, { error: `Zahlung konnte nicht geprüft werden: ${message}` });
    }
    if (!isSessionPaid(data)) {
      return response(402, { error: 'Für diese Session liegt keine abgeschlossene Zahlung vor.' });
    }
    return response(200, { token: accessToken, paid: true });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    console.error('[quantum-verify] Netzwerkfehler', { message: error.message });
    return response(timedOut ? 504 : 502, {
      error: timedOut ? 'Stripe hat nicht rechtzeitig geantwortet. Bitte Seite neu laden.' : (error.message || 'Bezahldienst nicht erreichbar.'),
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

module.exports.isSessionPaid = isSessionPaid;
