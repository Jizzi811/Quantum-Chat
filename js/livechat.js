/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Live-Chat (Chatwoot)
   Bindet das Chatwoot-Website-Widget ein und steuert es über den
   Schalter „💬 LIVE" im Chatfenster. Geladen wird NUR, wenn in
   window.QUANTUM_CHATWOOT sowohl baseUrl als auch websiteToken
   gesetzt sind (siehe Konfig-Block in index.html). Ohne Konfiguration
   bleibt der Schalter ausgeblendet — es bricht nichts.

   Werte holst du dir aus deinem Chatwoot-Konto (Cloud unter
   app.chatwoot.com oder selbst gehostet): Postfach vom Typ „Website"
   anlegen → dort stehen Basis-URL und Website-Token.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const cfg = window.QUANTUM_CHATWOOT || {};
  const baseUrl = String(cfg.baseUrl || '').replace(/\/+$/, '');
  const token = String(cfg.websiteToken || '').trim();
  const btn = document.getElementById('btn-livechat');

  /* Nicht konfiguriert → Schalter verstecken und aussteigen. */
  if (!baseUrl || !token) {
    if (btn) btn.hidden = true;
    return;
  }

  /* Eigene Steuerung: Standard-Sprechblase aus, wir öffnen per Schalter. */
  window.chatwootSettings = Object.assign(
    { hideMessageBubble: true, position: 'right', locale: 'de', type: 'standard' },
    window.chatwootSettings || {}
  );

  window.addEventListener('chatwoot:ready', function () {
    if (btn) btn.classList.add('is-ready');
  });

  /* Chatwoot-SDK nachladen und starten. */
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

  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      if (window.$chatwoot) window.$chatwoot.toggle('open');
      else window.open(baseUrl, '_blank', 'noopener'); /* Fallback bis SDK bereit */
    });
  }
})();
