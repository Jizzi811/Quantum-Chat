const test = require('node:test');
const assert = require('node:assert/strict');
const image = require('../netlify/functions/image.js');

test('predictUrl baut den Imagen-Endpunkt mit codiertem Key', () => {
  const url = image.predictUrl('imagen-3.0-generate-002', 'a b&c');
  assert.match(url, /\/models\/imagen-3\.0-generate-002:predict\?key=a%20b%26c$/);
});

test('buildImageBody übernimmt gültige Seitenverhältnisse', () => {
  const body = image.buildImageBody({ prompt: 'Neon', aspectRatio: '16:9' });
  assert.equal(body.instances[0].prompt, 'Neon');
  assert.equal(body.parameters.sampleCount, 1);
  assert.equal(body.parameters.aspectRatio, '16:9');
});

test('buildImageBody fällt bei ungültigem Verhältnis auf 1:1 zurück', () => {
  assert.equal(image.buildImageBody({ prompt: 'x', aspectRatio: '5:2' }).parameters.aspectRatio, '1:1');
  assert.equal(image.buildImageBody({ prompt: 'x' }).parameters.aspectRatio, '1:1');
});

test('extractImage liefert eine Data-URL aus der Imagen-Antwort', () => {
  const url = image.extractImage({ predictions: [{ bytesBase64Encoded: 'QUJD', mimeType: 'image/png' }] });
  assert.equal(url, 'data:image/png;base64,QUJD');
});

test('extractImage nimmt image/png als Default-MIME', () => {
  const url = image.extractImage({ predictions: [{ bytesBase64Encoded: 'WFla' }] });
  assert.equal(url, 'data:image/png;base64,WFla');
});

test('extractImage liefert null ohne Bilddaten', () => {
  assert.equal(image.extractImage({ predictions: [] }), null);
  assert.equal(image.extractImage({}), null);
  assert.equal(image.extractImage(null), null);
});
