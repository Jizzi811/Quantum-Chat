const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let registeredSkill = null;
global.window = global;
global.Quantum = { skills: { register(def) { registeredSkill = def; } } };

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/editor.js'), 'utf8'));

test('Skill „editor" ist registriert und verweist auf OpenCut', () => {
  assert.equal(registeredSkill.id, 'editor');
  assert.match(registeredSkill.name, /OpenCut/);
  assert.match(registeredSkill.desc, /OpenCut/);
});

test('editor-API stellt die OpenCut-URL bereit', () => {
  assert.equal(window.Quantum.editor.url, 'https://opencut.app');
  assert.equal(typeof window.Quantum.editor.open, 'function');
});

test('open() ohne window.open (Node) wirft nicht und gibt false zurück', () => {
  const orig = window.open;
  delete window.open;
  try {
    assert.equal(window.Quantum.editor.open(), false);
  } finally {
    if (orig) window.open = orig;
  }
});

test('run() liefert einen Hinweistext mit Link', () => {
  const out = registeredSkill.run('');
  assert.match(out, /VIDEO-EDITOR/);
  assert.match(out, /opencut\.app/);
});
