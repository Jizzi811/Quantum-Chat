/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Stripe Checkout (Abo 11,99 €/Monat)
   Erzeugt eine Stripe-Checkout-Session im Subscription-Modus für
   Karten- und SEPA-Lastschrift-Zahlung. Spricht die Stripe-REST-API
   direkt per fetch an — keine zusätzliche Abhängigkeit nötig.

   Benötigte Netlify-Umgebungsvariablen:
   - STRIPE_SECRET_KEY   (Pflicht)  z. B. sk_live_… / sk_test_…
   - STRIPE_PRICE_ID     (Pflicht)  Preis-ID des 11,99 €/Monat-Abos (price_…)
   Optional:
   - STRIPE_PAYMENT_METHODS   Komma-Liste, Default "card,sepa_debit"
                              (z. B. "card,sepa_debit,paypal", sobald in
                              Stripe aktiviert)
   - QUANTUM_ALLOWED_ORIGIN   erlaubte Origin (CORS/Referer-Schutz)
   - CHECKOUT_SUCCESS_URL / CHECKOUT_CANCEL_URL  überschreiben die aus der
                              Request-Origin abgeleiteten Rücksprung-URLs
   ═══════════════════════════════════════════════════════════════ */

const { envValue } = require('./quantum-shared.js');

const STRIPE_API = 'https://api.stripe.com/v1/checkout/sessions';
const UPSTREAM_TIMEOUT_MS = 8500;

/* Baut den formcodierten Stripe-Request-Body. Reine Funktion → testbar. */
function buildCheckoutForm({ priceId, successUrl, cancelUrl, methods }) {
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('locale', 'de');
  params.set('billing_address_collection', 'auto');
  params.set('allow_promotion_codes', 'true');
  const list = (methods && methods.length ? methods : ['card', 'sepa_debit']);
  list.forEach((method, index) => params.set(`payment_method_types[${index}]`, method));
  return params;
}

/* Origin-basierte Rücksprung-URLs (Erfolg/Abbruch) mit Override per Env. */
function resolveReturnUrls(origin) {
  const base = (envValue('QUANTUM_ALLOWED_ORIGIN') || origin || '').replace(/\/+$/, '');
  const success = envValue('CHECKOUT_SUCCESS_URL') || `${base}/?checkout=success`;
  const cancel = envValue('CHECKOUT_CANCEL_URL') || `${base}/?checkout=cancel`;
  return { success, cancel };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  const secret = envValue('STRIPE_SECRET_KEY');
  const priceId = envValue('STRIPE_PRICE_ID');
  if (!secret || !priceId) {
    return response(503, {
      error: 'Bezahlung ist noch nicht konfiguriert. Bitte STRIPE_SECRET_KEY und STRIPE_PRICE_ID in Netlify hinterlegen.',
    });
  }

  const origin = event.headers.origin || '';
  const allowedOrigin = envValue('QUANTUM_ALLOWED_ORIGIN');
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return response(403, { error: 'Origin not allowed.' });
  }

  const methods = (envValue('STRIPE_PAYMENT_METHODS') || 'card,sepa_debit')
    .split(',').map((m) => m.trim().toLowerCase()).filter(Boolean);
  const { success, cancel } = resolveReturnUrls(origin);
  const form = buildCheckoutForm({ priceId, successUrl: success, cancelUrl: cancel, methods });

  try {
    const upstream = await fetch(STRIPE_API, {
      method: 'POST',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const raw = await upstream.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { /* unten behandelt */ }

    if (!upstream.ok) {
      const message = (data && data.error && data.error.message) || `HTTP ${upstream.status}`;
      console.error('[quantum-checkout] Stripe-Fehler', { status: upstream.status, message });
      return response(502, { error: `Stripe-Anfrage fehlgeschlagen: ${message}` });
    }
    if (!data || !data.url) {
      return response(502, { error: 'Stripe lieferte keine Checkout-URL zurück.' });
    }
    return response(200, { url: data.url, id: data.id });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    console.error('[quantum-checkout] Netzwerkfehler', { message: error.message });
    return response(timedOut ? 504 : 502, {
      error: timedOut ? 'Stripe hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.'
        : (error.message || 'Bezahldienst nicht erreichbar.'),
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

module.exports.buildCheckoutForm = buildCheckoutForm;
module.exports.resolveReturnUrls = resolveReturnUrls;
