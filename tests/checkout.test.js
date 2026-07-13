const test = require('node:test');
const assert = require('node:assert/strict');
const checkout = require('../netlify/functions/checkout.js');

test('buildCheckoutForm erzeugt eine Abo-Session mit Preis und Rücksprung-URLs', () => {
  const form = checkout.buildCheckoutForm({
    priceId: 'price_123',
    successUrl: 'https://x/?checkout=success',
    cancelUrl: 'https://x/?checkout=cancel',
    methods: ['card', 'sepa_debit'],
  });
  assert.equal(form.get('mode'), 'subscription');
  assert.equal(form.get('line_items[0][price]'), 'price_123');
  assert.equal(form.get('line_items[0][quantity]'), '1');
  assert.equal(form.get('success_url'), 'https://x/?checkout=success');
  assert.equal(form.get('cancel_url'), 'https://x/?checkout=cancel');
  assert.equal(form.get('locale'), 'de');
  assert.equal(form.get('payment_method_types[0]'), 'card');
  assert.equal(form.get('payment_method_types[1]'), 'sepa_debit');
});

test('buildCheckoutForm nutzt Karte + SEPA als Default, wenn keine Methoden übergeben', () => {
  const form = checkout.buildCheckoutForm({ priceId: 'price_1', successUrl: 'a', cancelUrl: 'b', methods: [] });
  assert.equal(form.get('payment_method_types[0]'), 'card');
  assert.equal(form.get('payment_method_types[1]'), 'sepa_debit');
});

test('buildCheckoutForm übernimmt PayPal, wenn konfiguriert', () => {
  const form = checkout.buildCheckoutForm({ priceId: 'p', successUrl: 'a', cancelUrl: 'b', methods: ['card', 'sepa_debit', 'paypal'] });
  assert.equal(form.get('payment_method_types[2]'), 'paypal');
});

test('resolveReturnUrls leitet aus der Origin ab', () => {
  delete process.env.QUANTUM_ALLOWED_ORIGIN;
  delete process.env.CHECKOUT_SUCCESS_URL;
  delete process.env.CHECKOUT_CANCEL_URL;
  const urls = checkout.resolveReturnUrls('https://quantum811.netlify.app');
  assert.equal(urls.success, 'https://quantum811.netlify.app/?checkout=success');
  assert.equal(urls.cancel, 'https://quantum811.netlify.app/?checkout=cancel');
});

test('resolveReturnUrls bevorzugt QUANTUM_ALLOWED_ORIGIN vor der Request-Origin', () => {
  process.env.QUANTUM_ALLOWED_ORIGIN = 'https://fixed.example';
  const urls = checkout.resolveReturnUrls('https://angreifer.example');
  assert.equal(urls.success, 'https://fixed.example/?checkout=success');
  delete process.env.QUANTUM_ALLOWED_ORIGIN;
});
