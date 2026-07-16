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

  function outlineSystemPrompt(params) {
    var sprache = (params && params.sprache) || 'Deutsch';
    return 'Du bist ein erfahrener Kurs-Designer. Antworte AUSSCHLIESSLICH mit gültigem JSON, '
      + 'ohne Text davor oder danach, ohne Code-Fences. Schreibe alle Inhalte auf ' + sprache + '. '
      + 'Schema: {"titel":string,"untertitel":string,"beschreibung":string,"lehrplan":[string],'
      + '"module":[{"titel":string,"kurzbeschreibung":string,"lektionen":[{"titel":string,"lernziele":[string]}]}]}';
  }

  function outlineUserPrompt(thema, quelle, params) {
    params = params || {};
    var lines = [];
    lines.push('Erstelle den Lehrplan (nur Gliederung, noch keine Lektionstexte) für einen Online-Kurs.');
    lines.push('Thema: ' + thema);
    if (params.zielgruppe) lines.push('Zielgruppe: ' + params.zielgruppe);
    if (params.niveau) lines.push('Niveau: ' + params.niveau);
    lines.push('Anzahl Module: ' + (params.moduleCount || 4));
    lines.push('Lektionen pro Modul: ca. ' + (params.lessonsPerModule || 3));
    lines.push('Jede Lektion braucht 2–4 konkrete Lernziele.');
    if (quelle) lines.push('\nStütze dich inhaltlich auf dieses Quellmaterial:\n' + String(quelle).slice(0, 6000));
    return lines.join('\n');
  }

  function lessonSystemPrompt(params) {
    params = params || {};
    var sprache = params.sprache || 'Deutsch';
    return 'Du bist ein didaktisch starker Kurs-Autor. Antworte AUSSCHLIESSLICH mit gültigem JSON, '
      + 'ohne Code-Fences. Schreibe auf ' + sprache + '. '
      + 'Schema: {"inhalt":string (ausführlicher Erklärtext in Markdown, 250–500 Wörter),'
      + '"zusammenfassung":string,'
      + (params.quiz ? '"quiz":[{"frage":string,"optionen":[string],"loesungIndex":number,"erklaerung":string}],' : '')
      + '"uebungen":[{"aufgabe":string,"tipp":string,"loesung":string}]}';
  }

  function lessonUserPrompt(ctx) {
    ctx = ctx || {};
    var lines = [];
    lines.push('Schreibe die vollständige Lektion für diesen Kurs.');
    lines.push('Kurs: ' + ctx.kursTitel);
    if (ctx.zielgruppe) lines.push('Zielgruppe: ' + ctx.zielgruppe);
    if (ctx.niveau) lines.push('Niveau: ' + ctx.niveau);
    lines.push('Modul: ' + ctx.modulTitel);
    lines.push('Lektion: ' + ctx.lektionTitel);
    if (ctx.lernziele && ctx.lernziele.length) lines.push('Lernziele: ' + ctx.lernziele.join('; '));
    if (ctx.nachbarn && ctx.nachbarn.length) lines.push('Andere Lektionen im Kurs (nicht wiederholen): ' + ctx.nachbarn.join('; '));
    if (ctx.quelle) lines.push('\nQuellmaterial:\n' + String(ctx.quelle).slice(0, 3000));
    lines.push('\nGib ' + (ctx.quiz ? '2–4 Quizfragen mit je 3–4 Optionen und ' : '') + '1–2 praktische Übungen aus.');
    return lines.join('\n');
  }

  function extrasSystemPrompt(params) {
    var sprache = (params && params.sprache) || 'Deutsch';
    return 'Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Code-Fences. Sprache: ' + sprache + '. '
      + 'Schema: {"glossar":[{"begriff":string,"definition":string}],"ressourcen":[{"label":string,"notiz":string}]}';
  }

  function extrasUserPrompt(course) {
    var titles = [];
    arr(course.module).forEach(function (m) { arr(m.lektionen).forEach(function (l) { titles.push(l.titel); }); });
    return 'Erzeuge Begleitmaterial für den Kurs "' + course.titel + '".\n'
      + 'Lektionen: ' + titles.join('; ') + '\n'
      + 'Gib 8–15 Glossarbegriffe und 4–8 weiterführende Ressourcen (allgemeine Empfehlungen, keine erfundenen URLs).';
  }

  function themeStyle(theme) {
    if (theme === 'light') return 'Klarer, heller, moderner Flat-Illustration-Stil. ';
    if (theme === 'business') return 'Edler, professioneller Business-Stil. ';
    return 'Neon-Cyberpunk-Stil, leuchtende Farben. ';
  }

  function coverPrompt(course) {
    return 'Cover-Illustration für einen Online-Kurs mit dem Titel "' + course.titel + '". '
      + themeStyle(course.theme) + 'Ohne Text im Bild.';
  }

  function lessonImagePrompt(course, mi, li) {
    var l = course.module[mi].lektionen[li];
    return 'Illustration zum Lernthema "' + l.titel + '" (Kurs: ' + course.titel + '). '
      + themeStyle(course.theme) + 'Ohne Text im Bild.';
  }

  /* ── Öffentliche Schnittstelle (wächst über die weiteren Tasks) ── */
  window.Quantum.courseStudio = {
    escapeHtml: escapeHtml,
    cleanJson: cleanJson,
    slugify: slugify,
    parseOutline: parseOutline,
    parseLesson: parseLesson,
    parseExtras: parseExtras,
    outlineSystemPrompt: outlineSystemPrompt,
    outlineUserPrompt: outlineUserPrompt,
    lessonSystemPrompt: lessonSystemPrompt,
    lessonUserPrompt: lessonUserPrompt,
    extrasSystemPrompt: extrasSystemPrompt,
    extrasUserPrompt: extrasUserPrompt,
    themeStyle: themeStyle,
    coverPrompt: coverPrompt,
    lessonImagePrompt: lessonImagePrompt,
  };
})();
