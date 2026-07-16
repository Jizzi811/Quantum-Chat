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
