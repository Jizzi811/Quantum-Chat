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
  const verifyEndpoint = '/.netlify/functions/checkout-verify';

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

  /* Verifiziert die bezahlte Session bei Stripe und schaltet bei Erfolg
     automatisch frei (Zugangscode setzen). */
  async function unlockAfterPayment(sessionId, note) {
    setNote(note, 'Zahlung wird geprüft und Zugang freigeschaltet …');
    try {
      const res = await fetch(verifyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      let data = {};
      try { data = await res.json(); } catch (_) { /* unten */ }
      if (res.ok && data.token && window.Quantum.ai && window.Quantum.ai.setAccess) {
        window.Quantum.ai.setAccess(data.token);
        setNote(note, '✓ Willkommen! Dein Abo ist aktiv und der KI-Zugang ist freigeschaltet. Schließ die Startseite und leg los. ⚡', 'ok');
        if (window.Quantum.ui && window.Quantum.ui.system) {
          window.Quantum.ui.system('🔓 KI-Zugang nach erfolgreicher Zahlung automatisch freigeschaltet.');
        }
      } else {
        setNote(note, '✓ Danke für deine Zahlung! Automatische Freischaltung nicht möglich'
          + (data.error ? ' (' + data.error + ')' : '') + '. Deinen Zugangscode kannst du unten eingeben.', 'error');
      }
    } catch (error) {
      setNote(note, '✓ Zahlung erhalten. Freischaltung derzeit nicht erreichbar: ' + (error.message || 'Netzwerkfehler')
        + '. Bitte Zugangscode unten eingeben.', 'error');
    }
  }

  /* Rücksprung von Stripe auswerten und die URL-Parameter wieder entfernen. */
  function handleReturn(note) {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('checkout');
    if (!state) return;
    const sessionId = params.get('session_id');
    if (state === 'success' && sessionId) {
      unlockAfterPayment(sessionId, note);
    } else if (state === 'success') {
      setNote(note, '✓ Danke! Dein Abo ist aktiv. Deinen Zugangscode unten eingeben und loslegen.', 'ok');
    } else if (state === 'cancel') {
      setNote(note, 'Bezahlung abgebrochen — kein Problem, du kannst es jederzeit erneut versuchen.', 'error');
    }
    params.delete('checkout');
    params.delete('session_id');
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
