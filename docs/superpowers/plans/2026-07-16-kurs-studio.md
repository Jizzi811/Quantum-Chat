# Kurs-Studio (Online-Kurs-Generator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neues In-App-Studio, das aus Thema und/oder Quellmaterial per KI einen kompletten Online-Kurs (Module, Lektionen, Quizzes, Übungen, Bilder, Begleitmaterial) generiert und als eigenständige HTML-, PDF- und Markdown-Datei exportiert.

**Architecture:** Ein eigenständiges Vanilla-JS-IIFE-Modul (`js/course-studio.js`) nach dem bestehenden Studio-Muster, registriert als Skill `kurs`. Reine (DOM-freie) Parser-, Prompt- und Builder-Funktionen werden an `window.Quantum.courseStudio` exportiert und mit `node --test` getestet. Zwei-Phasen-Generierung mit Review: Phase 1 erzeugt den Lehrplan (1 KI-Aufruf), Phase 2 arbeitet pro Lektion aus (je 1 `askStream`-Aufruf), dann Begleitmaterial, dann optional Bilder.

**Tech Stack:** Vanilla JS (ES5-kompatibles IIFE wie die übrigen Module), `window.Quantum.ai.askStream`/`ask` als KI-Gateway, `window.Quantum.imageStudio.generate` für Bilder, `node:test` + `node:vm` für Tests. Kein Build-Schritt, keine neuen Runtime-Abhängigkeiten.

## Global Constraints

- Kein Build-Schritt, keine neuen Runtime-Dependencies. Reines Vanilla-JS-IIFE wie `js/presentation.js` / `js/image-studio.js`.
- **Kein DOM-Zugriff auf oberster Modulebene** (nur innerhalb von Funktionen), damit das Modul in der Node-Test-Sandbox ladbar ist.
- Alle UI-Texte auf Deutsch.
- KI-Aufrufe ausschließlich über `window.Quantum.ai.askStream({ system, prompt, temperature, maxTokens })` mit Rückfall auf `window.Quantum.ai.ask(...)`; Bilder über `window.Quantum.imageStudio.generate({ prompt, aspectRatio })`.
- Alle Nutzerinhalte im HTML-Export mit `escapeHtml` maskieren.
- Tests laufen mit `node --test tests/*.test.js` (Node ≥ 18, vorhandenes Setup).
- Nach jeder Aufgabe committen. Branch: `claude/online-course-generator-qdi56u`. Commit-Autor `Claude <noreply@anthropic.com>` ist per `git config` gesetzt.
- Datenmodell (verbindlich für alle Tasks):
  ```
  Kurs { titel, untertitel, beschreibung, zielgruppe, niveau, sprache, theme, cover,
         lehrplan:[string], glossar:[{begriff,definition}], ressourcen:[{label,notiz}],
         module:[ { titel, kurzbeschreibung,
                    lektionen:[ { titel, lernziele:[string], inhalt, zusammenfassung,
                                  bild, bildPrompt,
                                  quiz:[{frage,optionen:[string],loesungIndex,erklaerung}],
                                  uebungen:[{aufgabe,tipp,loesung}] } ] } ] }
  ```

---

## File Structure

- **Create `js/course-studio.js`** — das gesamte Modul (reine Funktionen + Prompts + Orchestrierung + Modal-UI + Skill-Registrierung). Wird über Tasks 1–9 inkrementell aufgebaut; jede Task fügt Funktionen hinzu und erweitert das Export-Objekt `window.Quantum.courseStudio`.
- **Create `css/course-studio.css`** — Styling des Modals und der Vorschau (Task 10).
- **Create `tests/course-studio.test.js`** — Unit-Tests; wird über Tasks 1–9 erweitert.
- **Modify `index.html`** — CSS-`<link>`, `<script>`-Einbindung, Landing-Feature-Eintrag (Task 10).

---

### Task 1: Modul-Grundgerüst + Helper (escapeHtml, cleanJson, slugify)

**Files:**
- Create: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Produces: `window.Quantum.courseStudio.escapeHtml(v) → string`, `.cleanJson(text) → object` (wirft bei ungültigem JSON), `.slugify(title) → string`

- [ ] **Step 1: Write the failing test**

Create `tests/course-studio.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE in js/course-studio.js nachbilden.
global.window = global;
global.Quantum = {
  skills: { register() {} },
  ai: {},
  imageStudio: {},
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/course-studio.js'), 'utf8'));
const CS = Quantum.courseStudio;

test('escapeHtml maskiert Sonderzeichen', () => {
  assert.equal(CS.escapeHtml('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
});

test('escapeHtml behandelt null/undefined als leeren String', () => {
  assert.equal(CS.escapeHtml(null), '');
  assert.equal(CS.escapeHtml(undefined), '');
});

test('cleanJson entfernt Code-Fences und parst Objekt', () => {
  assert.deepEqual(CS.cleanJson('```json\n{"a":1}\n```'), { a: 1 });
});

test('cleanJson schneidet Text um das JSON herum weg', () => {
  assert.deepEqual(CS.cleanJson('Hier dein JSON: {"a":2} — fertig.'), { a: 2 });
});

test('cleanJson wirft bei fehlendem JSON', () => {
  assert.throws(() => CS.cleanJson('nur Text, keine Klammern'), /kein gültiges JSON/);
});

test('slugify erzeugt sauberen Dateinamen', () => {
  assert.equal(CS.slugify('Excel für Anfänger!'), 'excel-für-anfänger');
  assert.equal(CS.slugify(''), 'kurs');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `Cannot find module '../js/course-studio.js'` bzw. `Cannot read properties of undefined`.

- [ ] **Step 3: Write minimal implementation**

Create `js/course-studio.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS (6 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: Modulgerüst und Helper (escapeHtml, cleanJson, slugify)"
```

---

### Task 2: Lehrplan-Parser (parseOutline)

**Files:**
- Modify: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Consumes: `cleanJson` (Task 1)
- Produces: `window.Quantum.courseStudio.parseOutline(text, params) → Kurs` (Modul-/Lektionsgerüst ohne Inhalt); `params = { thema, zielgruppe, niveau, sprache, theme }`. Wirft, wenn kein Modul erzeugt wurde. Interne Helfer `str(v,max)`, `arr(v)`, `clampInt(n,lo,hi,dflt)` entstehen hier und werden von späteren Tasks mitbenutzt.

- [ ] **Step 1: Write the failing test**

Append to `tests/course-studio.test.js`:

```js
test('parseOutline normalisiert Module und Lektionen', () => {
  const raw = JSON.stringify({
    titel: 'Excel-Grundlagen', untertitel: 'Von 0 auf produktiv', beschreibung: 'Ein Kurs.',
    lehrplan: ['Zellen', 'Formeln'],
    module: [{ titel: 'Einstieg', kurzbeschreibung: 'Basis', lektionen: [
      { titel: 'Die Oberfläche', lernziele: ['Menüband kennen', 'Zellen adressieren'] },
    ] }],
  });
  const course = CS.parseOutline(raw, { thema: 'Excel', zielgruppe: 'Büro', niveau: 'Einsteiger', sprache: 'Deutsch', theme: 'neon' });
  assert.equal(course.titel, 'Excel-Grundlagen');
  assert.equal(course.zielgruppe, 'Büro');
  assert.equal(course.sprache, 'Deutsch');
  assert.equal(course.theme, 'neon');
  assert.equal(course.module.length, 1);
  assert.equal(course.module[0].lektionen[0].titel, 'Die Oberfläche');
  assert.deepEqual(course.module[0].lektionen[0].lernziele, ['Menüband kennen', 'Zellen adressieren']);
  // Leere Inhaltsfelder sind vorbereitet:
  assert.equal(course.module[0].lektionen[0].inhalt, '');
  assert.deepEqual(course.module[0].lektionen[0].quiz, []);
});

test('parseOutline akzeptiert englische Feldnamen (title/lessons/objectives)', () => {
  const raw = JSON.stringify({ title: 'T', module: [{ title: 'M', lessons: [{ title: 'L', objectives: ['a'] }] }] });
  const course = CS.parseOutline(raw, { sprache: 'Deutsch' });
  assert.equal(course.module[0].titel, 'M');
  assert.equal(course.module[0].lektionen[0].titel, 'L');
  assert.deepEqual(course.module[0].lektionen[0].lernziele, ['a']);
});

test('parseOutline wirft, wenn kein Modul vorhanden ist', () => {
  assert.throws(() => CS.parseOutline('{"titel":"X","module":[]}', {}), /kein Lehrplan/i);
});

test('parseOutline begrenzt auf maximal 12 Module', () => {
  const module = Array.from({ length: 20 }, (_, i) => ({ titel: 'M' + i, lektionen: [{ titel: 'L' }] }));
  const course = CS.parseOutline(JSON.stringify({ titel: 'X', module }), {});
  assert.equal(course.module.length, 12);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `CS.parseOutline is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `js/course-studio.js`, add these helpers and `parseOutline` **after `slugify`** (inside the IIFE, before the export object):

```js
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
```

Extend the export object:

```js
  window.Quantum.courseStudio = {
    escapeHtml: escapeHtml,
    cleanJson: cleanJson,
    slugify: slugify,
    parseOutline: parseOutline,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: Lehrplan-Parser (parseOutline)"
```

---

### Task 3: Lektions- und Begleitmaterial-Parser (parseLesson, parseExtras)

**Files:**
- Modify: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Consumes: `cleanJson`, `str`, `arr` (Tasks 1–2)
- Produces: `parseLesson(text) → { inhalt, zusammenfassung, quiz:[{frage,optionen,loesungIndex,erklaerung}], uebungen:[{aufgabe,tipp,loesung}] }`; `parseExtras(text) → { glossar:[{begriff,definition}], ressourcen:[{label,notiz}] }`

- [ ] **Step 1: Write the failing test**

Append to `tests/course-studio.test.js`:

```js
test('parseLesson normalisiert Inhalt, Quiz und Übungen', () => {
  const raw = JSON.stringify({
    inhalt: 'Erklärtext', zusammenfassung: 'Kurz',
    quiz: [{ frage: 'Was ist 2+2?', optionen: ['3', '4', '5'], loesungIndex: 1, erklaerung: 'Addition' }],
    uebungen: [{ aufgabe: 'Rechne 3+3', tipp: 'zähle', loesung: '6' }],
  });
  const l = CS.parseLesson(raw);
  assert.equal(l.inhalt, 'Erklärtext');
  assert.equal(l.quiz.length, 1);
  assert.equal(l.quiz[0].loesungIndex, 1);
  assert.equal(l.uebungen[0].aufgabe, 'Rechne 3+3');
});

test('parseLesson wirft ungültige Quizfragen (< 2 Optionen) heraus und korrigiert loesungIndex', () => {
  const raw = JSON.stringify({
    inhalt: 'x',
    quiz: [
      { frage: 'nur eine Option', optionen: ['a'], loesungIndex: 0 },
      { frage: 'gut', optionen: ['a', 'b'], loesungIndex: 9 },
    ],
  });
  const l = CS.parseLesson(raw);
  assert.equal(l.quiz.length, 1);
  assert.equal(l.quiz[0].frage, 'gut');
  assert.equal(l.quiz[0].loesungIndex, 0); // 9 war ungültig → 0
});

test('parseLesson akzeptiert englische Feldnamen', () => {
  const raw = JSON.stringify({ content: 'c', summary: 's', quiz: [{ question: 'q', options: ['a', 'b'], answerIndex: 1, explanation: 'e' }], exercises: [{ task: 't' }] });
  const l = CS.parseLesson(raw);
  assert.equal(l.inhalt, 'c');
  assert.equal(l.quiz[0].frage, 'q');
  assert.equal(l.quiz[0].loesungIndex, 1);
  assert.equal(l.uebungen[0].aufgabe, 't');
});

test('parseExtras normalisiert Glossar und Ressourcen', () => {
  const raw = JSON.stringify({
    glossar: [{ begriff: 'Zelle', definition: 'Kästchen' }, { begriff: '', definition: 'leer' }],
    ressourcen: [{ label: 'Buch', notiz: 'Kap. 1' }, { notiz: 'kein Label' }],
  });
  const ex = CS.parseExtras(raw);
  assert.equal(ex.glossar.length, 1);
  assert.equal(ex.glossar[0].begriff, 'Zelle');
  assert.equal(ex.ressourcen.length, 1);
  assert.equal(ex.ressourcen[0].label, 'Buch');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `CS.parseLesson is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add after `parseOutline` in `js/course-studio.js`:

```js
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
```

Extend the export object with `parseLesson: parseLesson,` and `parseExtras: parseExtras,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: Lektions- und Begleitmaterial-Parser"
```

---

### Task 4: Prompt-Bausteine (Outline / Lesson / Extras / Bild)

**Files:**
- Modify: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Produces:
  - `outlineSystemPrompt(params) → string`, `outlineUserPrompt(thema, quelle, params) → string` (`params = { sprache, zielgruppe, niveau, moduleCount, lessonsPerModule }`)
  - `lessonSystemPrompt(params) → string` (`params = { sprache, quiz:boolean }`), `lessonUserPrompt(ctx) → string` (`ctx = { kursTitel, zielgruppe, niveau, sprache, modulTitel, lektionTitel, lernziele:[string], nachbarn:[string], quelle, quiz:boolean }`)
  - `extrasSystemPrompt(params) → string`, `extrasUserPrompt(course) → string`
  - `coverPrompt(course) → string`, `lessonImagePrompt(course, mi, li) → string`

- [ ] **Step 1: Write the failing test**

Append to `tests/course-studio.test.js`:

```js
test('outline-Prompts enthalten Sprache, Umfang und Quellmaterial', () => {
  const sys = CS.outlineSystemPrompt({ sprache: 'Englisch' });
  assert.match(sys, /Englisch/);
  assert.match(sys, /JSON/);
  const user = CS.outlineUserPrompt('Excel', 'MEINE QUELLE', { zielgruppe: 'Büro', niveau: 'Profi', moduleCount: 5, lessonsPerModule: 3 });
  assert.match(user, /Excel/);
  assert.match(user, /Büro/);
  assert.match(user, /5/);
  assert.match(user, /MEINE QUELLE/);
});

test('lessonSystemPrompt lässt Quiz-Schema weg, wenn quiz=false', () => {
  assert.doesNotMatch(CS.lessonSystemPrompt({ sprache: 'Deutsch', quiz: false }), /quiz/i);
  assert.match(CS.lessonSystemPrompt({ sprache: 'Deutsch', quiz: true }), /quiz/i);
});

test('lessonUserPrompt nennt Nachbarlektionen zur Abgrenzung', () => {
  const p = CS.lessonUserPrompt({ kursTitel: 'K', modulTitel: 'M', lektionTitel: 'L2', lernziele: ['z'], nachbarn: ['L1', 'L3'], quiz: true });
  assert.match(p, /L1/);
  assert.match(p, /L3/);
  assert.match(p, /L2/);
});

test('extrasUserPrompt listet alle Lektionstitel', () => {
  const course = { titel: 'K', module: [{ titel: 'M', lektionen: [{ titel: 'A' }, { titel: 'B' }] }] };
  const p = CS.extrasUserPrompt(course);
  assert.match(p, /A/);
  assert.match(p, /B/);
});

test('Bild-Prompts nennen Kurs- bzw. Lektionstitel und verbieten Text im Bild', () => {
  const course = { titel: 'Neon-Kurs', theme: 'neon', module: [{ titel: 'M', lektionen: [{ titel: 'Erste Lektion' }] }] };
  assert.match(CS.coverPrompt(course), /Neon-Kurs/);
  assert.match(CS.coverPrompt(course), /[Oo]hne Text/);
  assert.match(CS.lessonImagePrompt(course, 0, 0), /Erste Lektion/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `CS.outlineSystemPrompt is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add after `parseExtras` in `js/course-studio.js`:

```js
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
```

Extend the export object with: `outlineSystemPrompt`, `outlineUserPrompt`, `lessonSystemPrompt`, `lessonUserPrompt`, `extrasSystemPrompt`, `extrasUserPrompt`, `coverPrompt`, `lessonImagePrompt` (each `name: name,`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: Prompt-Bausteine für Lehrplan, Lektionen, Begleitmaterial und Bilder"
```

---

### Task 5: Markdown-Renderer (mdToHtml, buildMarkdown)

**Files:**
- Modify: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Consumes: `escapeHtml` (Task 1)
- Produces: `mdToHtml(md) → string` (minimaler, sicherer Markdown→HTML-Wandler: escaped zuerst, dann `**fett**`, `- Listen`, `# Überschriften`, Absätze); `buildMarkdown(course) → string`
- Hinweis: `mdToHtml` wird in Task 6 von `buildStandaloneHtml` genutzt.

- [ ] **Step 1: Write the failing test**

Append a shared fixture helper and tests to `tests/course-studio.test.js`:

```js
function sampleCourse() {
  return {
    titel: 'Excel-Grundlagen', untertitel: 'Sub', beschreibung: 'Beschreibung',
    zielgruppe: 'Büro', niveau: 'Einsteiger', sprache: 'Deutsch', theme: 'neon', cover: '',
    lehrplan: ['Zellen', 'Formeln'],
    glossar: [{ begriff: 'Zelle', definition: 'Ein Kästchen <x>' }],
    ressourcen: [{ label: 'Buch', notiz: 'Kap. 1' }],
    module: [{ titel: 'Einstieg', kurzbeschreibung: 'Basis', lektionen: [{
      titel: 'Oberfläche', lernziele: ['Menüband'], inhalt: 'Text mit **fett**.', zusammenfassung: 'Kurz',
      bild: '', bildPrompt: '',
      quiz: [{ frage: 'Frage?', optionen: ['A', 'B'], loesungIndex: 1, erklaerung: 'weil B' }],
      uebungen: [{ aufgabe: 'Mach X', tipp: 'so', loesung: 'fertig' }],
    }] }],
  };
}

test('mdToHtml wandelt fett und Listen um und maskiert HTML', () => {
  assert.match(CS.mdToHtml('Ein **wichtiger** Punkt'), /<strong>wichtiger<\/strong>/);
  assert.match(CS.mdToHtml('- a\n- b'), /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(CS.mdToHtml('<script>'), /&lt;script&gt;/);
});

test('buildMarkdown enthält Titel, Lektion, Quiz-Lösung und Glossar', () => {
  const md = CS.buildMarkdown(sampleCourse());
  assert.match(md, /^# Excel-Grundlagen/m);
  assert.match(md, /### 1\.1 Oberfläche/);
  assert.match(md, /\*\*B\*\* ✓/);           // richtige Antwort markiert
  assert.match(md, /## Glossar/);
  assert.match(md, /\*\*Zelle:\*\*/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `CS.mdToHtml is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add after `lessonImagePrompt` in `js/course-studio.js`:

```js
  function mdToHtml(md) {
    var esc = escapeHtml(md).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    var blocks = esc.split(/\n{2,}/);
    return blocks.map(function (block) {
      var lines = block.split('\n');
      if (lines.length && lines.every(function (ln) { return /^\s*[-*]\s+/.test(ln); })) {
        return '<ul>' + lines.map(function (ln) { return '<li>' + ln.replace(/^\s*[-*]\s+/, '') + '</li>'; }).join('') + '</ul>';
      }
      if (lines.length === 1 && /^#{1,4}\s+/.test(lines[0])) {
        var level = Math.min(lines[0].match(/^#+/)[0].length + 2, 6);
        return '<h' + level + '>' + lines[0].replace(/^#+\s+/, '') + '</h' + level + '>';
      }
      return '<p>' + lines.join('<br>') + '</p>';
    }).join('');
  }

  function buildMarkdown(course) {
    var out = [];
    out.push('# ' + course.titel);
    if (course.untertitel) out.push('*' + course.untertitel + '*');
    if (course.beschreibung) out.push('\n' + course.beschreibung);
    var meta = [];
    if (course.zielgruppe) meta.push('**Zielgruppe:** ' + course.zielgruppe);
    if (course.niveau) meta.push('**Niveau:** ' + course.niveau);
    if (meta.length) out.push('\n' + meta.join(' · '));
    if (course.lehrplan.length) {
      out.push('\n## Lehrplan');
      course.lehrplan.forEach(function (p) { out.push('- ' + p); });
    }
    if (course.cover) out.push('\n![Cover](' + course.cover + ')');
    course.module.forEach(function (m, mi) {
      out.push('\n## ' + (mi + 1) + '. ' + m.titel);
      if (m.kurzbeschreibung) out.push(m.kurzbeschreibung);
      m.lektionen.forEach(function (l, li) {
        out.push('\n### ' + (mi + 1) + '.' + (li + 1) + ' ' + l.titel);
        if (l.lernziele.length) {
          out.push('**Lernziele:**');
          l.lernziele.forEach(function (z) { out.push('- ' + z); });
        }
        if (l.bild) out.push('\n![' + l.titel + '](' + l.bild + ')');
        if (l.inhalt) out.push('\n' + l.inhalt);
        if (l.zusammenfassung) out.push('\n> **Zusammenfassung:** ' + l.zusammenfassung);
        if (l.quiz.length) {
          out.push('\n**Quiz:**');
          l.quiz.forEach(function (q, qi) {
            out.push((qi + 1) + '. ' + q.frage);
            q.optionen.forEach(function (o, oi) {
              out.push('   - ' + (oi === q.loesungIndex ? '**' + o + '** ✓' : o));
            });
            if (q.erklaerung) out.push('   > ' + q.erklaerung);
          });
        }
        if (l.uebungen.length) {
          out.push('\n**Übungen:**');
          l.uebungen.forEach(function (u, ui) {
            out.push((ui + 1) + '. ' + u.aufgabe);
            if (u.tipp) out.push('   - *Tipp:* ' + u.tipp);
            if (u.loesung) out.push('   - *Lösung:* ' + u.loesung);
          });
        }
      });
    });
    if (course.glossar.length) {
      out.push('\n## Glossar');
      course.glossar.forEach(function (g) { out.push('- **' + g.begriff + ':** ' + g.definition); });
    }
    if (course.ressourcen.length) {
      out.push('\n## Ressourcen');
      course.ressourcen.forEach(function (r) { out.push('- **' + r.label + '**' + (r.notiz ? ' — ' + r.notiz : '')); });
    }
    return out.join('\n');
  }
```

Extend the export object with `mdToHtml` and `buildMarkdown`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: Markdown-Renderer (mdToHtml, buildMarkdown)"
```

---

### Task 6: Eigenständiger HTML-Export (quizHtml, buildStandaloneHtml)

**Files:**
- Modify: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Consumes: `escapeHtml`, `mdToHtml` (Tasks 1, 5)
- Produces: `quizHtml(quiz, idPrefix) → string`; `buildStandaloneHtml(course) → string` (vollständige `<!doctype html>`-Seite mit eingebettetem CSS, Inhaltsverzeichnis, Bildern als `data:`-URL, interaktiven Quizzes und Inline-JS, Glossar, Ressourcen). Ein `THEMES`-Objekt (neon/business/light) entsteht hier.

- [ ] **Step 1: Write the failing test**

Append to `tests/course-studio.test.js`:

```js
test('buildStandaloneHtml erzeugt eine vollständige, maskierte HTML-Seite', () => {
  const course = sampleCourse();
  course.titel = 'Kurs <x>';
  course.module[0].lektionen[0].bild = 'data:image/png;base64,AAA';
  const html = CS.buildStandaloneHtml(course);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>Kurs &lt;x&gt;<\/title>/);   // Titel maskiert
  assert.match(html, /data:image\/png;base64,AAA/);        // Bild eingebettet
  assert.match(html, /qz__check/);                          // Quiz-Button
  assert.match(html, /addEventListener/);                   // Inline-Quiz-Skript
  assert.match(html, /Glossar/);
});

test('buildStandaloneHtml markiert die richtige Quiz-Antwort per data-correct', () => {
  const html = CS.buildStandaloneHtml(sampleCourse());
  // Option B (Index 1) ist korrekt:
  assert.match(html, /data-correct="1"[^>]*>\s*B/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `CS.buildStandaloneHtml is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add after `buildMarkdown` in `js/course-studio.js`:

```js
  var THEMES = {
    neon: { bg: '#080312', panel: '#160729', accent: '#B94DFF', accent2: '#00F5FF', text: '#FFFFFF', muted: '#CDBEE3' },
    business: { bg: '#111827', panel: '#1F2937', accent: '#D4A72C', accent2: '#F5D675', text: '#FFFFFF', muted: '#D1D5DB' },
    light: { bg: '#F5F7FB', panel: '#FFFFFF', accent: '#5B21B6', accent2: '#0891B2', text: '#111827', muted: '#4B5563' },
  };

  function quizHtml(quiz, idPrefix) {
    return quiz.map(function (q, qi) {
      var name = idPrefix + '-' + qi;
      var opts = q.optionen.map(function (o, oi) {
        return '<label class="qz__opt"><input type="radio" name="' + name + '" data-correct="' + (oi === q.loesungIndex ? '1' : '0') + '"> ' + escapeHtml(o) + '</label>';
      }).join('');
      return '<div class="qz"><p class="qz__q">' + escapeHtml(q.frage) + '</p>' + opts
        + '<button type="button" class="qz__check">Lösung anzeigen</button>'
        + (q.erklaerung ? '<p class="qz__exp" hidden>' + escapeHtml(q.erklaerung) + '</p>' : '') + '</div>';
    }).join('');
  }

  function standaloneCss(t) {
    return ':root{--bg:' + t.bg + ';--panel:' + t.panel + ';--accent:' + t.accent + ';--accent2:' + t.accent2 + ';--text:' + t.text + ';--muted:' + t.muted + '}'
      + '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.6}'
      + 'header.kh{padding:3rem 1.5rem;text-align:center;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}'
      + 'header.kh h1{margin:0;font-size:2.2rem}header.kh p{margin:.5rem 0 0;opacity:.9}'
      + '.wrap{display:flex;gap:2rem;max-width:1100px;margin:0 auto;padding:2rem 1.5rem;align-items:flex-start}'
      + 'nav.toc{position:sticky;top:1rem;flex:0 0 220px;background:var(--panel);border-radius:12px;padding:1rem}'
      + 'nav.toc a{color:var(--muted);text-decoration:none;display:block;padding:.25rem 0}nav.toc a:hover{color:var(--accent2)}'
      + 'main{flex:1;min-width:0}.mod{margin-bottom:2.5rem}.mod h2{color:var(--accent2);border-bottom:2px solid var(--accent);padding-bottom:.3rem}'
      + '.les{background:var(--panel);border-radius:12px;padding:1.25rem;margin:1rem 0}.les h3{margin-top:0}'
      + '.les__goals{color:var(--muted)}.les__img{width:100%;border-radius:10px;margin:.5rem 0}'
      + '.les__sum{border-left:3px solid var(--accent);padding-left:.75rem;color:var(--muted)}'
      + '.qz{background:rgba(255,255,255,.05);border-radius:10px;padding:.75rem;margin:.6rem 0}.qz__q{font-weight:bold;margin:.2rem 0}'
      + '.qz__opt{display:block;padding:.25rem .4rem;border-radius:6px;cursor:pointer}.qz__opt--correct{background:rgba(0,200,120,.35)}.qz__opt--wrong{background:rgba(220,60,60,.35)}'
      + '.qz__check{margin-top:.4rem;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:.35rem .8rem;cursor:pointer}'
      + '.qz__exp{color:var(--muted);margin:.4rem 0 0}details{margin:.4rem 0}summary{cursor:pointer;font-weight:bold}'
      + 'dl.gl dt{font-weight:bold;color:var(--accent2)}dl.gl dd{margin:0 0 .6rem}'
      + '@media(max-width:760px){.wrap{flex-direction:column}nav.toc{position:static;width:100%}}';
  }

  var STANDALONE_SCRIPT = '<scr' + 'ipt>document.querySelectorAll(".qz__check").forEach(function(b){b.addEventListener("click",function(){var qz=b.closest(".qz");qz.querySelectorAll(".qz__opt").forEach(function(o){var i=o.querySelector("input");if(i.getAttribute("data-correct")==="1")o.classList.add("qz__opt--correct");else if(i.checked)o.classList.add("qz__opt--wrong");});var e=qz.querySelector(".qz__exp");if(e)e.hidden=false;});});</scr' + 'ipt>';

  function buildStandaloneHtml(course) {
    var t = THEMES[course.theme] || THEMES.neon;
    var toc = '', body = '';
    if (course.lehrplan.length) {
      body += '<section class="mod"><h2>Lehrplan</h2><ul>' + course.lehrplan.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul></section>';
    }
    course.module.forEach(function (m, mi) {
      toc += '<a href="#m' + mi + '">' + (mi + 1) + '. ' + escapeHtml(m.titel) + '</a>';
      body += '<section class="mod" id="m' + mi + '"><h2>' + (mi + 1) + '. ' + escapeHtml(m.titel) + '</h2>';
      if (m.kurzbeschreibung) body += '<p class="mod__sum">' + escapeHtml(m.kurzbeschreibung) + '</p>';
      m.lektionen.forEach(function (l, li) {
        body += '<article class="les"><h3>' + (mi + 1) + '.' + (li + 1) + ' ' + escapeHtml(l.titel) + '</h3>';
        if (l.lernziele.length) body += '<ul class="les__goals">' + l.lernziele.map(function (z) { return '<li>' + escapeHtml(z) + '</li>'; }).join('') + '</ul>';
        if (l.bild) body += '<img class="les__img" src="' + l.bild + '" alt="' + escapeHtml(l.titel) + '">';
        if (l.inhalt) body += '<div class="les__body">' + mdToHtml(l.inhalt) + '</div>';
        if (l.zusammenfassung) body += '<p class="les__sum"><strong>Zusammenfassung:</strong> ' + escapeHtml(l.zusammenfassung) + '</p>';
        if (l.quiz.length) body += '<div class="les__quiz">' + quizHtml(l.quiz, 'q' + mi + '-' + li) + '</div>';
        if (l.uebungen.length) body += '<div class="les__ex"><h4>Übungen</h4>' + l.uebungen.map(function (u) {
          return '<details><summary>' + escapeHtml(u.aufgabe) + '</summary>' + (u.tipp ? '<p><em>Tipp:</em> ' + escapeHtml(u.tipp) + '</p>' : '') + (u.loesung ? '<p><strong>Lösung:</strong> ' + escapeHtml(u.loesung) + '</p>' : '') + '</details>';
        }).join('') + '</div>';
        body += '</article>';
      });
      body += '</section>';
    });
    if (course.glossar.length) {
      body += '<section class="mod"><h2>Glossar</h2><dl class="gl">' + course.glossar.map(function (g) {
        return '<dt>' + escapeHtml(g.begriff) + '</dt><dd>' + escapeHtml(g.definition) + '</dd>';
      }).join('') + '</dl></section>';
    }
    if (course.ressourcen.length) {
      body += '<section class="mod"><h2>Ressourcen</h2><ul>' + course.ressourcen.map(function (r) {
        return '<li><strong>' + escapeHtml(r.label) + '</strong>' + (r.notiz ? ' — ' + escapeHtml(r.notiz) : '') + '</li>';
      }).join('') + '</ul></section>';
    }
    var header = '<header class="kh">' + (course.cover ? '<img src="' + course.cover + '" alt="Cover" style="max-width:420px;width:100%;border-radius:12px;margin-bottom:1rem">' : '')
      + '<h1>' + escapeHtml(course.titel) + '</h1>' + (course.untertitel ? '<p>' + escapeHtml(course.untertitel) + '</p>' : '') + '</header>';
    return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
      + escapeHtml(course.titel) + '</title><style>' + standaloneCss(t) + '</style></head><body>'
      + header + '<div class="wrap"><nav class="toc">' + toc + '</nav><main>' + body + '</main></div>' + STANDALONE_SCRIPT + '</body></html>';
  }
```

Extend the export object with `quizHtml` and `buildStandaloneHtml`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: eigenständiger interaktiver HTML-Export"
```

---

### Task 7: PDF-/Druck-Export (buildPrintHtml)

**Files:**
- Modify: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Consumes: `escapeHtml`, `mdToHtml` (Tasks 1, 5)
- Produces: `buildPrintHtml(course) → string` (druckoptimierte Seite: Seitenumbruch pro Modul, statische Quizzes mit markierter Lösung, `print()`-Aufruf per Inline-Skript)

- [ ] **Step 1: Write the failing test**

Append to `tests/course-studio.test.js`:

```js
test('buildPrintHtml erzeugt druckbare Seite mit Seitenumbruch und markierter Lösung', () => {
  const html = CS.buildPrintHtml(sampleCourse());
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /page-break-before/);
  assert.match(html, /<strong>B ✓<\/strong>/);   // richtige Antwort markiert
  assert.match(html, /print\(\)/);                // Auto-Druck
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `CS.buildPrintHtml is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add after `buildStandaloneHtml` in `js/course-studio.js`:

```js
  function buildPrintHtml(course) {
    var body = '';
    if (course.lehrplan.length) {
      body += '<section class="pmod pmod--first"><h2>Lehrplan</h2><ul>' + course.lehrplan.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul></section>';
    }
    course.module.forEach(function (m, mi) {
      body += '<section class="pmod"><h2>' + (mi + 1) + '. ' + escapeHtml(m.titel) + '</h2>';
      if (m.kurzbeschreibung) body += '<p>' + escapeHtml(m.kurzbeschreibung) + '</p>';
      m.lektionen.forEach(function (l, li) {
        body += '<h3>' + (mi + 1) + '.' + (li + 1) + ' ' + escapeHtml(l.titel) + '</h3>';
        if (l.lernziele.length) body += '<ul>' + l.lernziele.map(function (z) { return '<li>' + escapeHtml(z) + '</li>'; }).join('') + '</ul>';
        if (l.bild) body += '<img src="' + l.bild + '" alt="' + escapeHtml(l.titel) + '">';
        if (l.inhalt) body += '<div>' + mdToHtml(l.inhalt) + '</div>';
        if (l.zusammenfassung) body += '<p class="psum"><strong>Zusammenfassung:</strong> ' + escapeHtml(l.zusammenfassung) + '</p>';
        l.quiz.forEach(function (q, qi) {
          body += '<p class="pq">' + (qi + 1) + '. ' + escapeHtml(q.frage) + '</p><ul>';
          q.optionen.forEach(function (o, oi) {
            body += '<li>' + (oi === q.loesungIndex ? '<strong>' + escapeHtml(o) + ' ✓</strong>' : escapeHtml(o)) + '</li>';
          });
          body += '</ul>';
          if (q.erklaerung) body += '<p class="pexp"><em>' + escapeHtml(q.erklaerung) + '</em></p>';
        });
        l.uebungen.forEach(function (u, ui) {
          body += '<p class="pex"><strong>Übung ' + (ui + 1) + ':</strong> ' + escapeHtml(u.aufgabe) + '</p>';
          if (u.loesung) body += '<p class="pexs"><em>Lösung:</em> ' + escapeHtml(u.loesung) + '</p>';
        });
      });
      body += '</section>';
    });
    if (course.glossar.length) {
      body += '<section class="pmod"><h2>Glossar</h2><dl>' + course.glossar.map(function (g) {
        return '<dt><strong>' + escapeHtml(g.begriff) + '</strong></dt><dd>' + escapeHtml(g.definition) + '</dd>';
      }).join('') + '</dl></section>';
    }
    if (course.ressourcen.length) {
      body += '<section class="pmod"><h2>Ressourcen</h2><ul>' + course.ressourcen.map(function (r) {
        return '<li><strong>' + escapeHtml(r.label) + '</strong>' + (r.notiz ? ' — ' + escapeHtml(r.notiz) : '') + '</li>';
      }).join('') + '</ul></section>';
    }
    var css = '@page{margin:2cm}*{box-sizing:border-box}body{font-family:Georgia,serif;color:#111;line-height:1.5;max-width:800px;margin:0 auto}'
      + 'h1{font-size:26pt;margin:0 0 .2rem}.lead{color:#555;margin:0 0 1.5rem}'
      + '.pmod h2{font-size:18pt;page-break-before:always;border-bottom:1px solid #999;padding-bottom:.2rem}.pmod--first h2{page-break-before:avoid}'
      + 'h3{font-size:14pt;margin-top:1rem}img{max-width:100%}.psum{border-left:3px solid #999;padding-left:.6rem;color:#333}'
      + '.pq{font-weight:bold;margin-bottom:.2rem}.pexp{color:#555;margin-top:0}.pex{margin-bottom:.1rem}.pexs{color:#333;margin-top:0}'
      + 'h3,.pq,.pex,img{page-break-inside:avoid}';
    return '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + escapeHtml(course.titel) + '</title><style>' + css + '</style></head><body>'
      + '<h1>' + escapeHtml(course.titel) + '</h1>' + (course.untertitel ? '<p class="lead">' + escapeHtml(course.untertitel) + '</p>' : '')
      + (course.beschreibung ? '<p>' + escapeHtml(course.beschreibung) + '</p>' : '') + body
      + '<scr' + 'ipt>onload=function(){setTimeout(function(){print()},300)}</scr' + 'ipt></body></html>';
  }
```

Extend the export object with `buildPrintHtml`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: druckoptimierter PDF-Export (buildPrintHtml)"
```

---

### Task 8: Generierungs-Orchestrierung (generateOutline, elaborateCourse)

**Files:**
- Modify: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Consumes: `outlineSystemPrompt`, `outlineUserPrompt`, `parseOutline`, `lessonSystemPrompt`, `lessonUserPrompt`, `parseLesson`, `extrasSystemPrompt`, `extrasUserPrompt`, `parseExtras`, `coverPrompt`, `lessonImagePrompt` (Tasks 2–4); `window.Quantum.ai.askStream`/`ask`; `window.Quantum.imageStudio.generate`
- Produces:
  - `generateOutline(params) → Promise<Kurs>` (`params = { thema, quelle, zielgruppe, niveau, sprache, theme, moduleCount, lessonsPerModule }`)
  - `elaborateCourse(course, params, hooks) → Promise<{ errors:[string], cancelled:boolean }>` — füllt `course` in-place; `params = { quelle, quiz:boolean, bilder:boolean }`; `hooks = { onProgress(label, done, total), shouldCancel() → boolean }` (beide optional). Fehlertoleranz: pro Lektion 1 Retry, dann Fallback-Text; Bild-/Extras-Fehler werden gesammelt, brechen den Lauf nicht ab.

- [ ] **Step 1: Write the failing test**

Append to `tests/course-studio.test.js`. Note the `beforeEach` resets the mocks:

```js
test.beforeEach(() => {
  Quantum.ai.ask = undefined;
  Quantum.ai.askStream = undefined;
  Quantum.imageStudio.generate = undefined;
});

test('generateOutline bevorzugt askStream und liefert ein Kurs-Gerüst', async () => {
  let streamCalls = 0;
  Quantum.ai.askStream = async (args) => {
    streamCalls += 1;
    assert.match(args.system, /JSON/);
    return { text: '{"titel":"T","module":[{"titel":"M","lektionen":[{"titel":"L","lernziele":["z"]}]}]}', model: 'm' };
  };
  const course = await CS.generateOutline({ thema: 'X', sprache: 'Deutsch', theme: 'neon', moduleCount: 4, lessonsPerModule: 3 });
  assert.equal(streamCalls, 1);
  assert.equal(course.module[0].lektionen[0].titel, 'L');
});

test('generateOutline fällt bei Stream-Fehler auf ask() zurück', async () => {
  Quantum.ai.askStream = async () => { throw new Error('Stream kaputt'); };
  let askCalls = 0;
  Quantum.ai.ask = async () => { askCalls += 1; return { text: '{"titel":"T","module":[{"titel":"M","lektionen":[{"titel":"L"}]}]}', model: 'm' }; };
  const course = await CS.generateOutline({ thema: 'X' });
  assert.equal(askCalls, 1);
  assert.equal(course.module[0].titel, 'M');
});

function outlineFixture() {
  return CS.parseOutline('{"titel":"Kurs","module":[{"titel":"M1","lektionen":[{"titel":"L1","lernziele":["a"]},{"titel":"L2","lernziele":["b"]}]}]}', { sprache: 'Deutsch', theme: 'neon' });
}

test('elaborateCourse füllt jede Lektion und meldet Fortschritt', async () => {
  const course = outlineFixture();
  let lessonCalls = 0;
  const progress = [];
  Quantum.ai.askStream = async (args) => {
    if (/Kurs-Autor/.test(args.system)) {
      lessonCalls += 1;
      return { text: '{"inhalt":"Voller Text","zusammenfassung":"kurz","quiz":[{"frage":"f","optionen":["a","b"],"loesungIndex":1,"erklaerung":"e"}],"uebungen":[{"aufgabe":"tu was"}]}', model: 'm' };
    }
    return { text: '{"glossar":[{"begriff":"g","definition":"d"}],"ressourcen":[{"label":"r"}]}', model: 'm' };
  };
  const result = await CS.elaborateCourse(course, { quiz: true, bilder: false }, {
    onProgress: (label) => progress.push(label),
  });
  assert.equal(lessonCalls, 2);
  assert.equal(course.module[0].lektionen[0].inhalt, 'Voller Text');
  assert.equal(course.glossar[0].begriff, 'g');
  assert.deepEqual(result.errors, []);
  assert.ok(progress.some((p) => /Lektion 1\/2/.test(p)));
});

test('elaborateCourse macht bei Lektionsfehler weiter (Retry, dann Fallback)', async () => {
  const course = outlineFixture();
  let calls = 0;
  Quantum.ai.askStream = async (args) => {
    if (/Kurs-Autor/.test(args.system)) {
      calls += 1;
      throw new Error('immer kaputt');
    }
    return { text: '{"glossar":[],"ressourcen":[]}', model: 'm' };
  };
  const result = await CS.elaborateCourse(course, { quiz: true, bilder: false }, {});
  assert.equal(calls, 4);                       // 2 Lektionen × (1 Versuch + 1 Retry)
  assert.equal(result.errors.length, 2);
  assert.match(course.module[0].lektionen[0].inhalt, /konnte nicht/);
});

test('elaborateCourse generiert Bilder nur bei bilder=true', async () => {
  const course = outlineFixture();
  Quantum.ai.askStream = async (args) => {
    if (/Kurs-Autor/.test(args.system)) return { text: '{"inhalt":"t","uebungen":[]}', model: 'm' };
    return { text: '{"glossar":[],"ressourcen":[]}', model: 'm' };
  };
  let imgCalls = 0;
  Quantum.imageStudio.generate = async () => { imgCalls += 1; return { image: 'data:image/png;base64,ZZZ' }; };
  await CS.elaborateCourse(course, { quiz: false, bilder: true }, {});
  assert.equal(imgCalls, 3);                    // 1 Cover + 2 Lektionen
  assert.equal(course.cover, 'data:image/png;base64,ZZZ');
  assert.equal(course.module[0].lektionen[0].bild, 'data:image/png;base64,ZZZ');
});

test('elaborateCourse bricht bei shouldCancel ab', async () => {
  const course = outlineFixture();
  Quantum.ai.askStream = async () => ({ text: '{"inhalt":"t","uebungen":[]}', model: 'm' });
  const result = await CS.elaborateCourse(course, { quiz: false, bilder: false }, { shouldCancel: () => true });
  assert.equal(result.cancelled, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `CS.generateOutline is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add after `buildPrintHtml` in `js/course-studio.js`:

```js
  function askAI(argsObj) {
    // Streaming bevorzugen (umgeht Netlifys 10-s-Limit), sonst klassisch.
    if (window.Quantum.ai && window.Quantum.ai.askStream) {
      return window.Quantum.ai.askStream(argsObj).catch(function () {
        return window.Quantum.ai.ask(argsObj);
      });
    }
    return window.Quantum.ai.ask(argsObj);
  }

  async function generateOutline(params) {
    params = params || {};
    var res = await askAI({
      system: outlineSystemPrompt(params),
      prompt: outlineUserPrompt(params.thema, params.quelle, params),
      temperature: 0.5, maxTokens: 4000,
    });
    return parseOutline(res.text, params);
  }

  function flatLessons(course) {
    var list = [];
    course.module.forEach(function (m, mi) { m.lektionen.forEach(function (l, li) { list.push({ mi: mi, li: li }); }); });
    return list;
  }

  async function elaborateOneLesson(course, pos, params) {
    var m = course.module[pos.mi];
    var l = m.lektionen[pos.li];
    var nachbarn = [];
    m.lektionen.forEach(function (x, i) { if (i !== pos.li) nachbarn.push(x.titel); });
    var res = await askAI({
      system: lessonSystemPrompt({ sprache: course.sprache, quiz: params.quiz }),
      prompt: lessonUserPrompt({
        kursTitel: course.titel, zielgruppe: course.zielgruppe, niveau: course.niveau, sprache: course.sprache,
        modulTitel: m.titel, lektionTitel: l.titel, lernziele: l.lernziele, nachbarn: nachbarn,
        quelle: params.quelle, quiz: params.quiz,
      }),
      temperature: 0.6, maxTokens: 3000,
    });
    var parsed = parseLesson(res.text);
    l.inhalt = parsed.inhalt; l.zusammenfassung = parsed.zusammenfassung;
    l.quiz = parsed.quiz; l.uebungen = parsed.uebungen;
  }

  async function elaborateCourse(course, params, hooks) {
    params = params || {}; hooks = hooks || {};
    function cancelled() { return typeof hooks.shouldCancel === 'function' && hooks.shouldCancel(); }
    function progress(label, done, total) { if (typeof hooks.onProgress === 'function') hooks.onProgress(label, done, total); }
    var errors = [];
    var lessons = flatLessons(course);

    // Phase 2a: Lektionen
    for (var i = 0; i < lessons.length; i++) {
      if (cancelled()) return { errors: errors, cancelled: true };
      progress('Lektion ' + (i + 1) + '/' + lessons.length, i, lessons.length);
      try {
        await elaborateOneLesson(course, lessons[i], params);
      } catch (e1) {
        try {
          await elaborateOneLesson(course, lessons[i], params);
        } catch (e2) {
          var l = course.module[lessons[i].mi].lektionen[lessons[i].li];
          l.inhalt = l.inhalt || '_Diese Lektion konnte nicht automatisch erzeugt werden. Bitte manuell ergänzen._';
          errors.push(l.titel + ': ' + (e2.message || 'Fehler'));
        }
      }
    }

    // Phase 2b: Begleitmaterial
    if (cancelled()) return { errors: errors, cancelled: true };
    progress('Begleitmaterial …', lessons.length, lessons.length);
    try {
      var ex = await askAI({
        system: extrasSystemPrompt({ sprache: course.sprache }),
        prompt: extrasUserPrompt(course), temperature: 0.5, maxTokens: 2000,
      });
      var parsedEx = parseExtras(ex.text);
      course.glossar = parsedEx.glossar; course.ressourcen = parsedEx.ressourcen;
    } catch (e) {
      errors.push('Begleitmaterial: ' + (e.message || 'Fehler'));
    }

    // Phase 2c: Bilder (optional, sequenziell, best effort)
    if (params.bilder && window.Quantum.imageStudio && window.Quantum.imageStudio.generate) {
      var targets = [{ cover: true }].concat(lessons);
      for (var j = 0; j < targets.length; j++) {
        if (cancelled()) return { errors: errors, cancelled: true };
        progress('Bild ' + (j + 1) + '/' + targets.length, j, targets.length);
        try {
          if (targets[j].cover) {
            var cres = await window.Quantum.imageStudio.generate({ prompt: coverPrompt(course), aspectRatio: '16:9' });
            course.cover = cres.image;
          } else {
            var p = targets[j];
            var lz = course.module[p.mi].lektionen[p.li];
            var ires = await window.Quantum.imageStudio.generate({ prompt: lessonImagePrompt(course, p.mi, p.li), aspectRatio: '16:9' });
            lz.bild = ires.image;
          }
        } catch (e) {
          errors.push('Bild ' + (j + 1) + ': ' + (e.message || 'Fehler'));
        }
      }
    }

    progress('Fertig', lessons.length, lessons.length);
    return { errors: errors, cancelled: false };
  }
```

Extend the export object with `generateOutline` and `elaborateCourse`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: Zwei-Phasen-Generierung (Lehrplan, Lektionen, Begleitmaterial, Bilder)"
```

---

### Task 9: Modal-UI, Export-Handler und Skill-Registrierung

**Files:**
- Modify: `js/course-studio.js`
- Test: `tests/course-studio.test.js`

**Interfaces:**
- Consumes: alle bisherigen Funktionen; `window.Quantum.skills.register`; `window.Quantum.uploads.getContext` (optional); `document`, `window.open`, `Blob`, `URL.createObjectURL`
- Produces: `window.Quantum.courseStudio.open(thema)`, `.close()`; registrierter Skill `kurs`
- Hinweis: UI-Funktionen greifen erst **beim Aufruf** auf `document` zu, nie beim Laden.

- [ ] **Step 1: Write the failing test**

Append to `tests/course-studio.test.js`:

```js
test('Skill "kurs" ist registriert und die reine API ist exportiert', () => {
  // skills.register wird im Test-Harness gesammelt:
  assert.ok(registeredSkills.kurs, 'Skill kurs registriert');
  assert.equal(registeredSkills.kurs.icon, '🎓');
  assert.equal(typeof CS.open, 'function');
  assert.equal(typeof CS.close, 'function');
  assert.equal(typeof CS.buildStandaloneHtml, 'function');
});
```

Update the **harness at the top** of the test file so `skills.register` records definitions — change the `global.Quantum` block to:

```js
const registeredSkills = {};
global.window = global;
global.Quantum = {
  skills: { register(def) { registeredSkills[def.id] = def; } },
  ai: {},
  imageStudio: {},
};
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/course-studio.test.js`
Expected: FAIL — `registeredSkills.kurs` is undefined (Registrierung fehlt noch).

- [ ] **Step 3: Write minimal implementation**

Add the UI layer after `elaborateCourse` in `js/course-studio.js` (before the export object). This block references `document`/`window.open` only inside functions:

```js
  /* ── Modal-UI ──────────────────────────────────────────────── */

  var modal = null;
  var state = { course: null, params: null, cancel: false };

  function setStatus(text, kind) {
    var el = modal.querySelector('.tts-studio__status');
    el.textContent = text || '';
    el.className = 'tts-studio__status' + (kind ? ' tts-studio__status--' + kind : '');
  }

  function showPanel(name) {
    ['setup', 'review', 'result'].forEach(function (p) {
      var sec = modal.querySelector('[data-panel="' + p + '"]');
      if (sec) sec.hidden = (p !== name);
    });
  }

  function collectParams() {
    var q = function (sel) { return modal.querySelector(sel); };
    return {
      thema: q('#course-topic').value.trim(),
      quelle: q('#course-source').value.trim(),
      zielgruppe: q('#course-audience').value.trim(),
      niveau: q('#course-level').value,
      sprache: q('#course-lang').value.trim() || 'Deutsch',
      theme: q('#course-theme').value,
      moduleCount: parseInt(q('#course-modules').value, 10) || 4,
      lessonsPerModule: parseInt(q('#course-lessons').value, 10) || 3,
      quiz: q('#course-quiz').checked,
      bilder: q('#course-images').checked,
    };
  }

  function renderOutlineEditor() {
    var c = state.course;
    var html = '<input class="course-edit__title" id="course-edit-title" value="' + escapeHtml(c.titel) + '">';
    c.module.forEach(function (m, mi) {
      html += '<div class="course-mod" data-mi="' + mi + '"><input class="course-mod__title" data-mi="' + mi + '" value="' + escapeHtml(m.titel) + '">'
        + '<button type="button" class="course-x" data-act="del-mod" data-mi="' + mi + '" title="Modul löschen">✕</button><ul class="course-les">';
      m.lektionen.forEach(function (l, li) {
        html += '<li><input class="course-les__title" data-mi="' + mi + '" data-li="' + li + '" value="' + escapeHtml(l.titel) + '">'
          + '<button type="button" class="course-x" data-act="up" data-mi="' + mi + '" data-li="' + li + '" title="hoch">↑</button>'
          + '<button type="button" class="course-x" data-act="down" data-mi="' + mi + '" data-li="' + li + '" title="runter">↓</button>'
          + '<button type="button" class="course-x" data-act="del-les" data-mi="' + mi + '" data-li="' + li + '" title="Lektion löschen">✕</button></li>';
      });
      html += '</ul><button type="button" class="course-add" data-act="add-les" data-mi="' + mi + '">+ Lektion</button></div>';
    });
    html += '<button type="button" class="course-add" data-act="add-mod">+ Modul</button>';
    modal.querySelector('.course-outline').innerHTML = html;
  }

  function syncOutlineFromEditor() {
    var c = state.course;
    var t = modal.querySelector('#course-edit-title');
    if (t) c.titel = t.value.trim() || c.titel;
    modal.querySelectorAll('.course-mod__title').forEach(function (inp) {
      c.module[+inp.dataset.mi].titel = inp.value.trim() || 'Modul';
    });
    modal.querySelectorAll('.course-les__title').forEach(function (inp) {
      c.module[+inp.dataset.mi].lektionen[+inp.dataset.li].titel = inp.value.trim() || 'Lektion';
    });
  }

  function emptyLesson(titel) {
    return { titel: titel, lernziele: [], inhalt: '', zusammenfassung: '', bild: '', bildPrompt: '', quiz: [], uebungen: [] };
  }

  function onOutlineClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    syncOutlineFromEditor();
    var c = state.course, mi = +btn.dataset.mi, li = +btn.dataset.li, act = btn.dataset.act;
    if (act === 'add-mod') c.module.push({ titel: 'Neues Modul', kurzbeschreibung: '', lektionen: [emptyLesson('Neue Lektion')] });
    else if (act === 'del-mod') c.module.splice(mi, 1);
    else if (act === 'add-les') c.module[mi].lektionen.push(emptyLesson('Neue Lektion'));
    else if (act === 'del-les') c.module[mi].lektionen.splice(li, 1);
    else if (act === 'up' && li > 0) c.module[mi].lektionen.splice(li - 1, 0, c.module[mi].lektionen.splice(li, 1)[0]);
    else if (act === 'down' && li < c.module[mi].lektionen.length - 1) c.module[mi].lektionen.splice(li + 1, 0, c.module[mi].lektionen.splice(li, 1)[0]);
    if (!c.module.length) c.module.push({ titel: 'Modul', kurzbeschreibung: '', lektionen: [emptyLesson('Lektion')] });
    renderOutlineEditor();
  }

  async function onGenerateOutline() {
    var params = collectParams();
    if (!params.thema) { setStatus('Bitte zuerst ein Thema eingeben.', 'error'); return; }
    if (!window.Quantum.ai || !window.Quantum.ai.hasAccess || !window.Quantum.ai.hasAccess()) {
      // hasAccess ist optional; wenn nicht vorhanden, einfach weiter versuchen
    }
    state.params = params;
    var btn = modal.querySelector('.course-gen-outline');
    btn.disabled = true;
    setStatus('Lehrplan wird generiert …');
    try {
      state.course = await generateOutline(params);
      renderOutlineEditor();
      showPanel('review');
      setStatus('');
    } catch (e) {
      setStatus('⚠ ' + (e.message || 'Lehrplan-Generierung fehlgeschlagen.'), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function onElaborate() {
    syncOutlineFromEditor();
    state.cancel = false;
    var btn = modal.querySelector('.course-elaborate');
    var cancelBtn = modal.querySelector('.course-cancel');
    var bar = modal.querySelector('.course-progress__bar');
    var lbl = modal.querySelector('.course-progress__label');
    modal.querySelector('.course-progress').hidden = false;
    btn.disabled = true; cancelBtn.hidden = false;
    try {
      var result = await elaborateCourse(state.course, state.params, {
        onProgress: function (label, done, total) {
          lbl.textContent = label;
          bar.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
        },
        shouldCancel: function () { return state.cancel; },
      });
      if (result.cancelled) { setStatus('Abgebrochen. Bereits erzeugte Inhalte bleiben erhalten.', 'error'); }
      else if (result.errors.length) { setStatus('Fertig — mit ' + result.errors.length + ' Hinweis(en): ' + result.errors.slice(0, 3).join(' | '), 'error'); }
      renderPreview();
      showPanel('result');
    } catch (e) {
      setStatus('⚠ ' + (e.message || 'Ausarbeitung fehlgeschlagen.'), 'error');
    } finally {
      btn.disabled = false; cancelBtn.hidden = true;
      modal.querySelector('.course-progress').hidden = true;
    }
  }

  function renderPreview() {
    modal.querySelector('.course-preview').innerHTML = buildStandaloneHtml(state.course)
      .replace(/^[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*$/, '');
  }

  function downloadBlob(content, filename, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function onExportHtml() { downloadBlob(buildStandaloneHtml(state.course), slugify(state.course.titel) + '-kurs.html', 'text/html'); }
  function onExportMd() { downloadBlob(buildMarkdown(state.course), slugify(state.course.titel) + '-kurs.md', 'text/markdown'); }
  function onExportPdf() {
    var win = window.open('', '_blank');
    if (!win) { setStatus('Popup blockiert. Bitte Popups für den PDF-Export erlauben.', 'error'); return; }
    win.document.write(buildPrintHtml(state.course));
    win.document.close();
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'tts-studio course-studio';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="tts-studio__card course-studio__card">'
      + '<div class="tts-studio__head"><span class="tts-studio__title">🎓 KURS-STUDIO</span><button class="tts-studio__close" title="Schließen">✕</button></div>'
      // Panel 1: Setup
      + '<section data-panel="setup">'
      + '<label class="tts-studio__label" for="course-topic">Thema</label>'
      + '<textarea id="course-topic" class="tts-studio__text" rows="2" maxlength="600" placeholder="z. B. Excel für Einsteiger"></textarea>'
      + '<label class="tts-studio__label" for="course-source">Quellmaterial (optional)</label>'
      + '<textarea id="course-source" class="tts-studio__text" rows="3" maxlength="12000" placeholder="Eigene Texte hier einfügen …"></textarea>'
      + '<button type="button" class="course-import">📎 Aus angehängten Dateien übernehmen</button>'
      + '<div class="course-fields">'
      + '<label>Zielgruppe<input id="course-audience" class="tts-studio__input" placeholder="z. B. Büroangestellte"></label>'
      + '<label>Niveau<select id="course-level" class="tts-studio__input"><option>Einsteiger</option><option>Fortgeschritten</option><option>Profi</option></select></label>'
      + '<label>Sprache<input id="course-lang" class="tts-studio__input" value="Deutsch"></label>'
      + '<label>Design<select id="course-theme" class="tts-studio__input"><option value="neon">Quantum Neon</option><option value="business">Gold Business</option><option value="light">Clean Light</option></select></label>'
      + '<label>Module<input id="course-modules" class="tts-studio__input" type="number" min="1" max="12" value="4"></label>'
      + '<label>Lektionen/Modul<input id="course-lessons" class="tts-studio__input" type="number" min="1" max="10" value="3"></label>'
      + '</div>'
      + '<div class="course-checks"><label><input type="checkbox" id="course-quiz" checked> Quizzes &amp; Übungen</label>'
      + '<label><input type="checkbox" id="course-images"> Bilder generieren</label></div>'
      + '<button class="tts-studio__generate course-gen-outline">📋 LEHRPLAN GENERIEREN</button>'
      + '</section>'
      // Panel 2: Review
      + '<section data-panel="review" hidden>'
      + '<p class="course-hint">Prüfe und bearbeite die Struktur, dann arbeite den Kurs aus.</p>'
      + '<div class="course-outline"></div>'
      + '<div class="course-progress" hidden><div class="course-progress__track"><div class="course-progress__bar"></div></div><span class="course-progress__label"></span></div>'
      + '<div class="course-actions"><button class="tts-studio__generate course-elaborate">✍️ KURS AUSARBEITEN</button>'
      + '<button class="course-cancel" hidden>Abbrechen</button>'
      + '<button class="course-back" data-goto="setup">← Zurück</button></div>'
      + '</section>'
      // Panel 3: Result
      + '<section data-panel="result" hidden>'
      + '<div class="course-exports"><button class="course-exp-html">⬇ HTML-Kurs</button><button class="course-exp-pdf">⬇ PDF</button><button class="course-exp-md">⬇ Markdown</button>'
      + '<button class="course-back" data-goto="review">← Struktur</button></div>'
      + '<div class="course-preview"></div>'
      + '</section>'
      + '<div class="tts-studio__status" aria-live="polite"></div>'
      + '</div>';
    document.body.appendChild(modal);

    modal.querySelector('.tts-studio__close').onclick = close;
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    modal.querySelector('.course-gen-outline').onclick = onGenerateOutline;
    modal.querySelector('.course-outline').addEventListener('click', onOutlineClick);
    modal.querySelector('.course-elaborate').onclick = onElaborate;
    modal.querySelector('.course-cancel').onclick = function () { state.cancel = true; };
    modal.querySelector('.course-exp-html').onclick = onExportHtml;
    modal.querySelector('.course-exp-pdf').onclick = onExportPdf;
    modal.querySelector('.course-exp-md').onclick = onExportMd;
    modal.querySelector('.course-import').onclick = function () {
      var ctx = (window.Quantum.uploads && window.Quantum.uploads.getContext) ? window.Quantum.uploads.getContext() : '';
      if (!ctx) { setStatus('Keine Text-Anhänge gefunden. Hänge oben über 📎 eine Datei an.', 'error'); return; }
      var field = modal.querySelector('#course-source');
      field.value = (field.value ? field.value + '\n\n' : '') + ctx;
      setStatus('Angehängtes Material übernommen.', 'ok');
    };
    modal.querySelectorAll('.course-back').forEach(function (b) { b.onclick = function () { showPanel(b.dataset.goto); }; });
  }

  function open(thema) {
    if (!modal) buildModal();
    modal.hidden = false;
    showPanel('setup');
    if (thema) modal.querySelector('#course-topic').value = thema;
    modal.querySelector('#course-topic').focus();
  }

  function close() { if (modal) modal.hidden = true; }
```

Extend the export object with `open: open, close: close,` and, **after** assigning `window.Quantum.courseStudio`, register the skill:

```js
  if (window.Quantum.skills) window.Quantum.skills.register({
    id: 'kurs', icon: '🎓', name: 'Kurs-Studio',
    desc: 'Generiert komplette Online-Kurse (Module, Lektionen, Quizzes, Bilder) und exportiert HTML, PDF & Markdown',
    usage: '/skill kurs <thema>',
    run: function (input) {
      open((input || '').trim());
      return '🎓 **KURS-STUDIO** geöffnet. Gib dein Thema ein, generiere den Lehrplan, arbeite den Kurs aus und exportiere ihn als HTML, PDF oder Markdown.';
    },
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/course-studio.test.js`
Expected: PASS (alle Tests inkl. Registrierung).

- [ ] **Step 5: Commit**

```bash
git add js/course-studio.js tests/course-studio.test.js
git commit -m "Kurs-Studio: Modal-UI, Export-Handler und Skill-Registrierung"
```

---

### Task 10: Styling und Einbindung in die App

**Files:**
- Create: `css/course-studio.css`
- Modify: `index.html` (CSS-`<link>` bei den übrigen Studio-Styles; `<script>` nach `js/image-studio.js`; Landing-Feature-Eintrag)

**Interfaces:**
- Consumes: das registrierte `kurs`-Skill-Modul; vorhandene `tts-studio`-Klassen (Modal-Grundlayout)

- [ ] **Step 1: Create the stylesheet**

Create `css/course-studio.css`:

```css
/* Kurs-Studio — nutzt das tts-studio-Grundlayout, ergänzt Kurs-Spezifika */
.course-studio__card { max-width: 780px; }
.course-fields { display: grid; grid-template-columns: repeat(2, 1fr); gap: .6rem; margin: .6rem 0; }
.course-fields label { display: flex; flex-direction: column; gap: .2rem; font-size: .85rem; }
.course-checks { display: flex; gap: 1.2rem; flex-wrap: wrap; margin: .4rem 0 .8rem; }
.course-checks label { display: flex; align-items: center; gap: .4rem; }
.course-import { background: transparent; border: 1px solid var(--border-soft, #40306a); color: inherit; border-radius: 8px; padding: .35rem .7rem; cursor: pointer; margin-top: .3rem; }
.course-hint { color: var(--muted, #cdbee3); font-size: .9rem; }
.course-outline { max-height: 46vh; overflow: auto; padding-right: .3rem; }
.course-edit__title { width: 100%; font-size: 1.1rem; font-weight: bold; margin-bottom: .6rem; padding: .4rem; border-radius: 8px; border: 1px solid var(--border-soft, #40306a); background: rgba(255,255,255,.05); color: inherit; }
.course-mod { border: 1px solid var(--border-soft, #40306a); border-radius: 10px; padding: .6rem; margin-bottom: .6rem; }
.course-mod__title { flex: 1; font-weight: bold; padding: .3rem; border-radius: 6px; border: 1px solid var(--border-soft, #40306a); background: rgba(255,255,255,.05); color: inherit; }
.course-les { list-style: none; margin: .5rem 0 .3rem; padding: 0; display: flex; flex-direction: column; gap: .3rem; }
.course-les li { display: flex; gap: .3rem; align-items: center; }
.course-les__title { flex: 1; padding: .25rem; border-radius: 6px; border: 1px solid var(--border-soft, #40306a); background: rgba(255,255,255,.04); color: inherit; }
.course-x { background: transparent; border: 0; color: var(--muted, #cdbee3); cursor: pointer; font-size: .9rem; padding: .1rem .3rem; }
.course-x:hover { color: #fff; }
.course-add { background: transparent; border: 1px dashed var(--border-soft, #40306a); color: var(--muted, #cdbee3); border-radius: 8px; padding: .25rem .6rem; cursor: pointer; }
.course-actions, .course-exports { display: flex; gap: .5rem; flex-wrap: wrap; margin: .8rem 0; align-items: center; }
.course-exports button, .course-back, .course-cancel { background: var(--panel, #160729); border: 1px solid var(--border-soft, #40306a); color: inherit; border-radius: 8px; padding: .4rem .8rem; cursor: pointer; }
.course-progress { margin: .6rem 0; }
.course-progress__track { height: 8px; background: rgba(255,255,255,.1); border-radius: 4px; overflow: hidden; }
.course-progress__bar { height: 100%; width: 0; background: linear-gradient(90deg, var(--accent, #b94dff), var(--accent2, #00f5ff)); transition: width .3s; }
.course-progress__label { font-size: .85rem; color: var(--muted, #cdbee3); }
.course-preview { max-height: 60vh; overflow: auto; border: 1px solid var(--border-soft, #40306a); border-radius: 10px; padding: 1rem; margin-top: .6rem; background: rgba(0,0,0,.2); }
.course-preview .les { border: 1px solid var(--border-soft, #40306a); border-radius: 10px; padding: .8rem; margin: .6rem 0; }
.course-preview img { max-width: 100%; border-radius: 8px; }
@media (max-width: 620px) { .course-fields { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Wire the stylesheet into `index.html`**

In `index.html`, after the line `<link rel="stylesheet" href="css/presentation-studio.css" />` (currently line 38), add:

```html
  <link rel="stylesheet" href="css/course-studio.css" />
```

- [ ] **Step 3: Wire the script into `index.html`**

In `index.html`, after the line `<script src="js/image-studio.js"></script>` (currently line 353), add:

```html
  <script src="js/course-studio.js"></script>
```

(image-studio.js and skills.js both load before this point, satisfying the dependencies.)

- [ ] **Step 4: Add the landing feature bullet**

In `index.html`, after the Game-Studio bullet (currently line 100, `<li>…Game Studio…</li>`), add:

```html
        <li><span class="landing__ico">🎓</span><span><b>Kurs-Studio</b><small>Komplette Online-Kurse per Prompt — als HTML, PDF &amp; Markdown.</small></span></li>
```

- [ ] **Step 5: Run the full test suite**

Run: `node --test tests/*.test.js`
Expected: PASS — alle bestehenden Tests plus die neuen Kurs-Studio-Tests grün.

- [ ] **Step 6: Manual verification in the browser**

Use the `run` skill (or open `index.html` via a static server) and verify:
1. Skill „🎓 Kurs-Studio" erscheint in der Skills-Liste; `/skill kurs Excel für Einsteiger` öffnet das Modal mit vorbelegtem Thema.
2. Mit gültigem KI-Zugangscode: „Lehrplan generieren" erzeugt eine editierbare Gliederung; Hinzufügen/Löschen/Verschieben funktioniert.
3. „Kurs ausarbeiten" zeigt den Fortschrittsbalken und füllt die Vorschau.
4. Exporte: HTML lädt eine öffenbare Datei mit klickbaren Quizzes; PDF öffnet den Druckdialog; Markdown lädt eine `.md`.

Wenn kein Zugangscode/kein Netz verfügbar ist, mindestens 1–2 verifizieren und die restlichen als „nicht ausführbar in dieser Umgebung" vermerken.

- [ ] **Step 7: Commit**

```bash
git add css/course-studio.css index.html
git commit -m "Kurs-Studio: Styling und Einbindung in die App"
```

---

## Self-Review

**1. Spec coverage:**
- Zwei-Phasen-Generierung mit Review → Tasks 8 (Orchestrierung) + 9 (Review-Editor). ✅
- Struktur & Lektionstexte → parseOutline/parseLesson (Tasks 2–3), Lesson-Prompts (Task 4). ✅
- Quizzes & Übungen → parseLesson, lessonSystemPrompt (quiz-Flag), Render in HTML/PDF/MD. ✅
- Bilder pro Lektion → elaborateCourse Phase 2c + coverPrompt/lessonImagePrompt (Tasks 4, 8). ✅
- Begleitmaterial (Lehrplan/Glossar/Ressourcen) → parseOutline (lehrplan), parseExtras, extras-Prompts, Render überall. ✅
- Export HTML/PDF/Markdown → Tasks 5–7 + Handler in Task 9. ✅
- Quelle: Thema + eigenes Material → Setup-Textarea + „aus Anhängen übernehmen" (Task 9), quelle in Prompts (Task 4). ✅
- Fehlertoleranz (Retry/Fallback, Bild best-effort, Abbrechen) → Task 8. ✅
- Testkonzept (vm-Sandbox, reine Funktionen) → jede Task. ✅
- Einbindung + Landing → Task 10. ✅
- YAGNI-Grenzen (kein LMS/SCORM/Drag&Drop/Persistenz) → nicht implementiert. ✅

**2. Placeholder scan:** Keine TBD/TODO; jeder Code-Step enthält vollständigen Code und konkrete Befehle mit erwarteter Ausgabe.

**3. Type consistency:** Kurs-/Lektions-Felder (`titel`, `lektionen`, `lernziele`, `inhalt`, `zusammenfassung`, `quiz{frage,optionen,loesungIndex,erklaerung}`, `uebungen{aufgabe,tipp,loesung}`, `glossar{begriff,definition}`, `ressourcen{label,notiz}`) sind über alle Parser, Builder und Renderer identisch benannt. `parseOutline`/`parseLesson`/`parseExtras`/`generateOutline`/`elaborateCourse` stimmen zwischen Definition (Tasks 2–8) und Verwendung (Task 9) überein. Export-Objekt-Namen entsprechen den Testzugriffen `CS.*`.

---

## Execution Handoff (siehe unten)
