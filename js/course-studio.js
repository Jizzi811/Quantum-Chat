/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Kurs-Studio
   Skill "kurs": generiert komplette Online-Kurse (Module, Lektionen,
   Quizzes, Übungen, Bilder, Begleitmaterial) und exportiert sie als
   eigenständige HTML-, PDF- und Markdown-Datei.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  /* ── Reine Helfer ──────────────────────────────────────────── */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function cleanJson(text) {
    var raw = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    var start = raw.indexOf('{');
    var end = raw.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Die KI-Antwort enthielt kein gültiges JSON.');
    return JSON.parse(raw.slice(start, end + 1));
  }

  function slugify(title) {
    return String(title || 'kurs').toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-+|-+$/g, '') || 'kurs';
  }

  /* ── Öffentliche Schnittstelle (wächst über die weiteren Tasks) ── */
  window.Quantum.courseStudio = {
    escapeHtml: escapeHtml,
    cleanJson: cleanJson,
    slugify: slugify,
  };
})();
