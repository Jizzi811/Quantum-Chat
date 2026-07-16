const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE in js/course-studio.js nachbilden.
const registeredSkills = {};
global.window = global;
global.Quantum = {
  skills: { register(def) { registeredSkills[def.id] = def; } },
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

test('buildPrintHtml erzeugt druckbare Seite mit Seitenumbruch und markierter Lösung', () => {
  const html = CS.buildPrintHtml(sampleCourse());
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /page-break-before/);
  assert.match(html, /<strong>B ✓<\/strong>/);   // richtige Antwort markiert
  assert.match(html, /print\(\)/);                // Auto-Druck
});

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

test('Skill "kurs" ist registriert und die reine API ist exportiert', () => {
  // skills.register wird im Test-Harness gesammelt:
  assert.ok(registeredSkills.kurs, 'Skill kurs registriert');
  assert.equal(registeredSkills.kurs.icon, '🎓');
  assert.equal(typeof CS.open, 'function');
  assert.equal(typeof CS.close, 'function');
  assert.equal(typeof CS.buildStandaloneHtml, 'function');
});
