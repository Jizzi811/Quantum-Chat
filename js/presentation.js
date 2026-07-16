/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Präsentations-Studio (Presenton)
   Öffnet den separat gehosteten Presenton-Editor zum Erstellen und
   Bearbeiten von Präsentationen. Skill: /skill praesentation
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const PRESENTON_URL = '/presenton';

  function openPresentationStudio() {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(PRESENTON_URL, '_blank', 'noopener,noreferrer');
      return true;
    }
    return false;
  }

  window.Quantum.presentation = { url: PRESENTON_URL, open: openPresentationStudio };

  if (window.Quantum.skills) {
    window.Quantum.skills.register({
      id: 'praesentation', icon: '📊', name: 'Präsentations-Studio (Presenton)',
      desc: 'Öffnet den KI-Präsentationseditor Presenton in einem neuen Tab',
      usage: '/skill praesentation',
      run() {
        openPresentationStudio();
        return '📊 **PRAESENTATIONS-STUDIO (Presenton)** wird in einem neuen Tab geöffnet …\n\n'
          + 'Erstelle und bearbeite dort KI-Präsentationen und exportiere sie als PPTX oder PDF.\n\n'
          + '👉 Falls kein Tab aufgeht (Popup-Blocker), hier manuell öffnen: '
          + '[/presenton](' + PRESENTON_URL + ')';
      },
    });
  }
})();
