const test = require('node:test');
const assert = require('node:assert/strict');
const image = require('../netlify/functions/image.js');

test('generateContentUrl baut den Gemini-Endpunkt mit codiertem Key', () => {
  const url = image.generateContentUrl('gemini-3.1-flash-image', 'a b&c');
  assert.match(url, /\/models\/gemini-3\.1-flash-image:generateContent\?key=a%20b%26c$/);
});

test('resolveModel ersetzt alte Imagen-Konfigurationen', () => {
  assert.equal(image.resolveModel('imagen-3.0-generate-002'), 'gemini-3.1-flash-image');
  assert.equal(image.resolveModel('gemini-2.5-flash-image'), 'gemini-2.5-flash-image');
});

test('buildImageBody übernimmt gültige Seitenverhältnisse', () => {
  const body = image.buildImageBody({ prompt: 'Neon', aspectRatio: '16:9' });
  assert.equal(body.contents[0].parts[0].text, 'Neon');
  assert.deepEqual(body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.equal(body.generationConfig.imageConfig.aspectRatio, '16:9');
});

test('buildImageBody fällt bei ungültigem Verhältnis auf 1:1 zurück', () => {
  assert.equal(image.buildImageBody({ prompt: 'x', aspectRatio: '5:2' }).generationConfig.imageConfig.aspectRatio, '1:1');
  assert.equal(image.buildImageBody({ prompt: 'x' }).generationConfig.imageConfig.aspectRatio, '1:1');
});

test('extractImage liefert eine Data-URL aus der Gemini-Antwort', () => {
  const url = image.extractImage({ candidates: [{ content: { parts: [{ text: 'Fertig' }, { inlineData: { data: 'QUJD', mimeType: 'image/webp' } }] } }] });
  assert.equal(url, 'data:image/webp;base64,QUJD');
});

test('extractImage nimmt image/png als Default-MIME', () => {
  const url = image.extractImage({ candidates: [{ content: { parts: [{ inline_data: { data: 'WFla' } }] } }] });
  assert.equal(url, 'data:image/png;base64,WFla');
});

test('extractImage liefert null ohne Bilddaten', () => {
  assert.equal(image.extractImage({ candidates: [] }), null);
  assert.equal(image.extractImage({}), null);
  assert.equal(image.extractImage(null), null);
});
