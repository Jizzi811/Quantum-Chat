const test = require('node:test');
const assert = require('node:assert/strict');
const verify = require('../netlify/functions/checkout-verify.js');

test('isSessionPaid akzeptiert abgeschlossene, bezahlte Sessions', () => {
  assert.equal(verify.isSessionPaid({ status: 'complete', payment_status: 'paid' }), true);
});

test('isSessionPaid akzeptiert Abos ohne Sofortzahlung (Trial)', () => {
  assert.equal(verify.isSessionPaid({ status: 'complete', payment_status: 'no_payment_required' }), true);
});

test('isSessionPaid lehnt offene oder unbezahlte Sessions ab', () => {
  assert.equal(verify.isSessionPaid({ status: 'open', payment_status: 'unpaid' }), false);
  assert.equal(verify.isSessionPaid({ status: 'complete', payment_status: 'unpaid' }), false);
  assert.equal(verify.isSessionPaid({ status: 'expired', payment_status: 'paid' }), false);
  assert.equal(verify.isSessionPaid(null), false);
  assert.equal(verify.isSessionPaid({}), false);
});
