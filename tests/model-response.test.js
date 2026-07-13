const test = require('node:test');
const assert = require('node:assert/strict');
const modelResponse = require('../js/model-response.js');

// 9a) reines JSON
test('parst reines JSON', () => {
  const result = modelResponse.parse('{"title":"Neon","mode":"target"}');
  assert.equal(result.kind, 'json');
  assert.deepEqual(result.data, { title: 'Neon', mode: 'target' });
});

test('parst reines JSON-Array', () => {
  const result = modelResponse.parse('[1,2,3]');
  assert.equal(result.kind, 'json');
  assert.deepEqual(result.data, [1, 2, 3]);
});

// 9b) JSON in Markdown-Codeblock
test('entfernt Markdown-Codeblock ```json', () => {
  const result = modelResponse.parse('```json\n{"a":1}\n```');
  assert.equal(result.kind, 'json');
  assert.deepEqual(result.data, { a: 1 });
});

test('entfernt Markdown-Codeblock ohne Sprachangabe', () => {
  const result = modelResponse.parse('```\n{"a":1}\n```');
  assert.equal(result.kind, 'json');
  assert.deepEqual(result.data, { a: 1 });
});

// 9c) Erklärungstext vor dem JSON
test('ignoriert Text vor dem ersten JSON-Objekt', () => {
  const result = modelResponse.parse('Hier ist dein Spiel als JSON:\n{"a":1,"b":{"c":"}"}} Danke!');
  assert.equal(result.kind, 'json');
  assert.deepEqual(result.data, { a: 1, b: { c: '}' } });
});

// 9d) direktes vollständiges HTML — kein JSON.parse
test('erkennt <!DOCTYPE html> als HTML', () => {
  const html = '<!DOCTYPE html><html><body><h1>Spiel</h1></body></html>';
  const result = modelResponse.parse(html);
  assert.equal(result.kind, 'html');
  assert.equal(result.html, html);
});

test('erkennt <html auch mit Text davor und in Codeblock', () => {
  const result = modelResponse.parse('Hier ist das Spiel:\n```html\n<html lang="de"><body>x</body></html>\n```');
  assert.equal(result.kind, 'html');
  assert.ok(result.html.startsWith('<html'));
  assert.ok(result.html.endsWith('</html>'));
});

// 9e) content ist bereits ein geparstes Objekt
test('reicht bereits geparste Objekte unverändert durch', () => {
  const obj = { html: '<p>x</p>' };
  const result = modelResponse.parse(obj);
  assert.equal(result.kind, 'json');
  assert.equal(result.data, obj);
});

test('fügt OpenAI-Content-Parts (Array) zu Text zusammen', () => {
  const result = modelResponse.parse([
    { type: 'text', text: '{"a":' },
    { type: 'text', text: '1}' },
  ]);
  assert.equal(result.kind, 'json');
  assert.deepEqual(result.data, { a: 1 });
});

// Ursprüngliche Fehlerursache: Zahl gefolgt von Text darf nicht crashen
test('wirft nicht bei "200 OK ..." (Position-4-Fehler)', () => {
  const result = modelResponse.parse('200 OK but this is not JSON');
  assert.equal(result.kind, 'text');
  assert.equal(result.text, '200 OK but this is not JSON');
});

test('leerer/null-Content ergibt kind "empty"', () => {
  assert.equal(modelResponse.parse('').kind, 'empty');
  assert.equal(modelResponse.parse(null).kind, 'empty');
  assert.equal(modelResponse.parse(undefined).kind, 'empty');
});

// Reasoning-Modelle: <think>-Blöcke dürfen das Parsen nicht stören
test('entfernt geschlossene <think>-Blöcke vor HTML', () => {
  const result = modelResponse.parse('<think>Ich plane ein Snake-Spiel …</think>\n<!doctype html><html><body>x</body></html>');
  assert.equal(result.kind, 'html');
  assert.ok(result.html.startsWith('<!doctype html>'));
  assert.ok(!result.html.includes('<think>'));
});

test('entfernt <think>-Blöcke vor JSON', () => {
  const result = modelResponse.parse('<think>hmm</think>{"a":1}');
  assert.equal(result.kind, 'json');
  assert.deepEqual(result.data, { a: 1 });
});

test('nicht geschlossenes <think> (nur Denken, keine Antwort) ergibt empty', () => {
  const result = modelResponse.parse('<think>Ich überlege noch, wie das Spiel aussehen soll und');
  assert.equal(result.kind, 'empty');
});

// extractHtml — für das Game Studio
test('extractHtml liefert HTML aus direktem HTML', () => {
  const html = '<!doctype html><html><body>x</body></html>';
  assert.equal(modelResponse.extractHtml(html), html);
});

test('extractHtml liefert HTML aus Codeblock', () => {
  assert.equal(
    modelResponse.extractHtml('```html\n<!doctype html><html><body>x</body></html>\n```'),
    '<!doctype html><html><body>x</body></html>'
  );
});

test('extractHtml liefert html-Feld aus JSON-Antwort', () => {
  assert.equal(
    modelResponse.extractHtml('{"html":"<!doctype html><html><body>x</body></html>"}'),
    '<!doctype html><html><body>x</body></html>'
  );
});

test('extractHtml liefert html-Feld aus bereits geparstem Objekt', () => {
  assert.equal(
    modelResponse.extractHtml({ html: '<html><body>x</body></html>' }),
    '<html><body>x</body></html>'
  );
});

test('extractHtml liefert null für unbrauchbaren Text', () => {
  assert.equal(modelResponse.extractHtml('Ich kann leider kein Spiel bauen.'), null);
  assert.equal(modelResponse.extractHtml('200 OK'), null);
  assert.equal(modelResponse.extractHtml(''), null);
});
