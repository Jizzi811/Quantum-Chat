const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const searchFn = require('../netlify/functions/search.js');

test('clampMax begrenzt die Ergebnisanzahl auf 1..8', () => {
  assert.equal(searchFn.clampMax(undefined), 5);
  assert.equal(searchFn.clampMax(0), 5);
  assert.equal(searchFn.clampMax(3), 3);
  assert.equal(searchFn.clampMax(50), 8);
  assert.equal(searchFn.clampMax('2'), 2);
});

test('normalizeResults kappt Felder, filtert URL-lose Treffer, zieht answer', () => {
  const data = {
    answer: '  Kurzantwort.  ',
    results: [
      { title: 'A', url: 'https://a.de', content: 'foo   bar\n\nbaz' },
      { title: 'ohne url', url: '', content: 'x' },
      { title: 'C', url: 'https://c.de', content: 'y' },
    ],
  };
  const out = searchFn.normalizeResults(data, 5);
  assert.equal(out.answer, 'Kurzantwort.');
  assert.equal(out.results.length, 2);
  assert.deepEqual(out.results[0], { title: 'A', url: 'https://a.de', content: 'foo bar baz' });
  assert.equal(out.results[1].url, 'https://c.de');
});

test('normalizeResults respektiert das max-Limit', () => {
  const data = { results: Array.from({ length: 8 }, (_, i) => ({ title: 't' + i, url: 'https://x' + i + '.de', content: 'c' })) };
  assert.equal(searchFn.normalizeResults(data, 3).results.length, 3);
});

// Browser-IIFE aus js/websearch.js nachbilden.
let registered = null;
global.window = global;
global.Quantum = { skills: { register(def) { registered = def; } } };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/websearch.js'), 'utf8'));
const webSearch = window.Quantum.webSearch;

test('Skill „websuche" ist registriert', () => {
  assert.equal(registered.id, 'websuche');
  assert.match(registered.name, /Websuche/);
});

test('formatSources nummeriert Titel und URLs', () => {
  const s = webSearch.formatSources([
    { title: 'Erste', url: 'https://eins.de' },
    { title: '', url: 'https://zwei.de' },
  ]);
  assert.match(s, /\[1\] Erste\nhttps:\/\/eins\.de/);
  assert.match(s, /\[2\] https:\/\/zwei\.de/);
});
