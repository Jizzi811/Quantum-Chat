/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Video-Editor (OpenCut)
   Einstieg in unserem Design zum freien Open-Source-Video-Editor
   OpenCut (Schneiden, Timeline, Export — läuft im Browser). OpenCut
   ist eine eigenständige App; wir öffnen sie in einem neuen Tab.
   Skill: /skill editor
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const OPENCUT_URL = 'https://opencut.app';

  /* Öffnet OpenCut in einem neuen Tab (nur im Browser). */
  function openEditor() {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(OPENCUT_URL, '_blank', 'noopener,noreferrer');
      return true;
    }
    return false;
  }

  /* Für Tests / andere Module. */
  window.Quantum.editor = { url: OPENCUT_URL, open: openEditor };

  if (window.Quantum.skills) {
    window.Quantum.skills.register({
      id: 'editor', icon: '✂️', name: 'Video-Editor (OpenCut)',
      desc: 'Öffnet den freien Video-Editor OpenCut in einem neuen Tab',
      usage: '/skill editor',
      run() {
        openEditor();
        return '✂️ **VIDEO-EDITOR (OpenCut)** wird in einem neuen Tab geöffnet …\n\n'
          + 'OpenCut ist ein kostenloser Open-Source-Video-Editor — Timeline, Schneiden, '
          + 'Trimmen und Export, komplett im Browser.\n\n'
          + '👉 Falls kein Tab aufgeht (Popup-Blocker), hier manuell öffnen: '
          + '[opencut.app](' + OPENCUT_URL + ')';
      },
    });
  }
})();
