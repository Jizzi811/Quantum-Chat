/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Checkout-Anbindung (Client)
   Verbindet den „Jetzt abonnieren"-Button mit der Netlify-Function
   /checkout, die eine Stripe-Checkout-Session (Karte + SEPA) erstellt.
   Behandelt außerdem den Rücksprung (?checkout=success|cancel).
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const endpoint = '/.netlify/functions/checkout';

  function setNote(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'sell__note' + (kind ? ' sell__note--' + kind : '');
  }

  async function startCheckout(button, note) {
    button.disabled = true;
    setNote(note, 'Weiterleitung zur sicheren Bezahlung …');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      let data = {};
      try { data = await res.json(); } catch (_) { /* unten behandelt */ }
      if (!res.ok || !data.url) {
        const reason = data.error || ('Bezahldienst-Fehler (HTTP ' + res.status + ').');
        setNote(note, '⚠ ' + reason, 'error');
        button.disabled = false;
        return;
      }
      /* Weiter zur gehosteten Stripe-Checkout-Seite (PCI-konform). */
      window.location.href = data.url;
    } catch (error) {
      setNote(note, '⚠ Bezahlung nicht erreichbar: ' + (error.message || 'Netzwerkfehler') + '.', 'error');
      button.disabled = false;
    }
  }

  /* Rücksprung von Stripe auswerten und den URL-Parameter wieder entfernen. */
  function handleReturn(note) {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('checkout');
    if (!state) return;
    if (state === 'success') {
      setNote(note, '✓ Danke! Dein Abo ist aktiv. Deinen Zugangscode erhältst du per E-Mail — hier unten eingeben und loslegen.', 'ok');
    } else if (state === 'cancel') {
      setNote(note, 'Bezahlung abgebrochen — kein Problem, du kannst es jederzeit erneut versuchen.', 'error');
    }
    params.delete('checkout');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : ''));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('btn-subscribe');
    const note = document.getElementById('sell-note');
    if (button) button.addEventListener('click', () => startCheckout(button, note));
    handleReturn(note);
  });

  window.Quantum.checkout = { endpoint, startCheckout };
})();
