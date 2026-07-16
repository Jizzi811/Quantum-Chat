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

  function parseLesson(text) {
    var data = cleanJson(text);
    return {
      inhalt: str(data.inhalt || data.content, 8000),
      zusammenfassung: str(data.zusammenfassung || data.summary, 800),
      quiz: arr(data.quiz).map(function (q) {
        var optionen = arr(q.optionen || q.options).slice(0, 6).map(function (o) { return str(o, 300); }).filter(Boolean);
        var idx = parseInt(q.loesungIndex != null ? q.loesungIndex : q.answerIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= optionen.length) idx = 0;
        return { frage: str(q.frage || q.question, 400), optionen: optionen, loesungIndex: idx, erklaerung: str(q.erklaerung || q.explanation, 500) };
      }).filter(function (q) { return q.frage && q.optionen.length >= 2; }).slice(0, 8),
      uebungen: arr(data.uebungen || data.exercises).map(function (u) {
        return { aufgabe: str(u.aufgabe || u.task, 500), tipp: str(u.tipp || u.hint, 300), loesung: str(u.loesung || u.solution, 800) };
      }).filter(function (u) { return u.aufgabe; }).slice(0, 6),
    };
  }

  function parseExtras(text) {
    var data = cleanJson(text);
    return {
      glossar: arr(data.glossar || data.glossary).map(function (g) {
        return { begriff: str(g.begriff || g.term, 120), definition: str(g.definition, 500) };
      }).filter(function (g) { return g.begriff && g.definition; }).slice(0, 40),
      ressourcen: arr(data.ressourcen || data.resources).map(function (r) {
        return { label: str(r.label, 200), notiz: str(r.notiz || r.note, 300) };
      }).filter(function (r) { return r.label; }).slice(0, 30),
    };
  }

  /* ── Öffentliche Schnittstelle (wächst über die weiteren Tasks) ── */
  window.Quantum.courseStudio = {
    escapeHtml: escapeHtml,
    cleanJson: cleanJson,
    slugify: slugify,
    parseOutline: parseOutline,
    parseLesson: parseLesson,
    parseExtras: parseExtras,
  };
})();
