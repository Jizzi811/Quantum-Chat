/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Live-Chat-Schalter „💬" im Chatfenster
   Zwei Optionen, die erste konfigurierte gewinnt:

   (A) WhatsApp  — window.QUANTUM_WHATSAPP.number (internationale Form,
       z. B. '491759913517'). Öffnet einen wa.me-Chat, optional mit
       vorformulierter Nachricht. Kein Konto/kein SDK nötig.

   (B) Chatwoot  — window.QUANTUM_CHATWOOT.baseUrl + .websiteToken aus
       einem Chatwoot-Postfach vom Typ „Website".

   Ist nichts konfiguriert, bleibt der Schalter ausgeblendet.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const btn = document.getElementById('btn-livechat');
  if (!btn) return;

  /* ── (A) WhatsApp: einfachste Variante ───────────────────────── */
  const wa = window.QUANTUM_WHATSAPP || {};
  const waNumber = String(wa.number || '').replace(/\D/g, ''); /* nur Ziffern */
  if (waNumber) {
    const url = 'https://wa.me/' + waNumber
      + (wa.text ? '?text=' + encodeURIComponent(String(wa.text)) : '');
    btn.textContent = '💬 WHATSAPP';
    btn.title = 'Frag uns per WhatsApp';
    btn.hidden = false;
    btn.addEventListener('click', function () {
      window.open(url, '_blank', 'noopener');
    });
    return;
  }

  /* ── (B) Chatwoot: Website-Widget ────────────────────────────── */
  const cfg = window.QUANTUM_CHATWOOT || {};
  const baseUrl = String(cfg.baseUrl || '').replace(/\/+$/, '');
  const token = String(cfg.websiteToken || '').trim();

  if (!baseUrl || !token) {
    btn.hidden = true;
    return;
  }

  /* Eigene Steuerung: Standard-Sprechblase aus, wir öffnen per Schalter. */
  window.chatwootSettings = Object.assign(
    { hideMessageBubble: true, position: 'right', locale: 'de', type: 'standard' },
    window.chatwootSettings || {}
  );

  window.addEventListener('chatwoot:ready', function () {
    btn.classList.add('is-ready');
  });

  (function (d, t) {
    const g = d.createElement(t);
    const s = d.getElementsByTagName(t)[0];
    g.src = baseUrl + '/packs/js/sdk.js';
    g.defer = true;
    g.async = true;
    s.parentNode.insertBefore(g, s);
    g.onload = function () {
      if (window.chatwootSDK) {
        window.chatwootSDK.run({ websiteToken: token, baseUrl: baseUrl });
      }
    };
  })(document, 'script');

  btn.hidden = false;
  btn.addEventListener('click', function () {
    if (window.$chatwoot) window.$chatwoot.toggle('open');
    else window.open(baseUrl, '_blank', 'noopener'); /* Fallback bis SDK bereit */
  });
})();
