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

  function str(value, max) { return String(value == null ? '' : value).slice(0, max); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function clampInt(n, lo, hi, dflt) {
    var v = parseInt(n, 10);
    if (isNaN(v)) v = dflt;
    return Math.max(lo, Math.min(hi, v));
  }

  function parseOutline(text, params) {
    params = params || {};
    var data = cleanJson(text);
    var module = arr(data.module || data.modules).slice(0, 12).map(function (m) {
      return {
        titel: str(m.titel || m.title, 160) || 'Modul',
        kurzbeschreibung: str(m.kurzbeschreibung || m.summary, 400),
        lektionen: arr(m.lektionen || m.lessons).slice(0, 12).map(function (l) {
          return {
            titel: str(l.titel || l.title, 160) || 'Lektion',
            lernziele: arr(l.lernziele || l.objectives).slice(0, 6).map(function (z) { return str(z, 200); }).filter(Boolean),
            inhalt: '', zusammenfassung: '', bild: '', bildPrompt: '',
            quiz: [], uebungen: [],
          };
        }),
      };
    });
    if (!module.length) throw new Error('Es wurde kein Lehrplan erzeugt.');
    return {
      titel: str(data.titel || data.title, 160) || str(params.thema, 160) || 'Kurs',
      untertitel: str(data.untertitel || data.subtitle, 200),
      beschreibung: str(data.beschreibung || data.description, 800),
      zielgruppe: str(params.zielgruppe, 160),
      niveau: str(params.niveau, 60),
      sprache: str(params.sprache, 40) || 'Deutsch',
      theme: str(params.theme, 20) || 'neon',
      cover: '',
      lehrplan: arr(data.lehrplan || data.syllabus).slice(0, 20).map(function (p) { return str(p, 200); }).filter(Boolean),
      glossar: [], ressourcen: [],
      module: module,
    };
  }

  /* ── Öffentliche Schnittstelle (wächst über die weiteren Tasks) ── */
  window.Quantum.courseStudio = {
    escapeHtml: escapeHtml,
    cleanJson: cleanJson,
    slugify: slugify,
    parseOutline: parseOutline,
  };
})();
