/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Übersicht-Tab-Umschaltung
   Generisch und unabhängig von einzelnen Panels: schaltet zwischen
   allen [data-overview-tab]/[data-overview-panel]-Paaren um. Liegt
   bewusst in einer eigenen Datei, damit die Umschaltung immer läuft,
   auch wenn ein Panel-Skript (z. B. Songsee) früh zurückkehrt.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  function activate(button) {
    const target = button.dataset.overviewTab;
    document.querySelectorAll('[data-overview-tab]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-overview-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.overviewPanel !== target;
    });
  }

  document.querySelectorAll('[data-overview-tab]').forEach((button) => {
    button.addEventListener('click', () => activate(button));
  });
})();
