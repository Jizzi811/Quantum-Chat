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
