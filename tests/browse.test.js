const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const browseFn = require('../netlify/functions/browse.js');

test('isPublicHttpUrl lässt öffentliche http(s)-URLs zu', () => {
  assert.equal(browseFn.isPublicHttpUrl('https://example.com/foo'), true);
  assert.equal(browseFn.isPublicHttpUrl('http://nachrichten.de/artikel?id=3'), true);
});

test('isPublicHttpUrl blockt interne/private Adressen und fremde Schemata (SSRF)', () => {
  assert.equal(browseFn.isPublicHttpUrl('http://localhost/admin'), false);
  assert.equal(browseFn.isPublicHttpUrl('http://127.0.0.1'), false);
  assert.equal(browseFn.isPublicHttpUrl('http://10.0.0.5'), false);
  assert.equal(browseFn.isPublicHttpUrl('http://192.168.1.1'), false);
  assert.equal(browseFn.isPublicHttpUrl('http://172.16.0.9'), false);
  assert.equal(browseFn.isPublicHttpUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(browseFn.isPublicHttpUrl('https://intern.local'), false);
  assert.equal(browseFn.isPublicHttpUrl('ftp://example.com'), false);
  assert.equal(browseFn.isPublicHttpUrl('javascript:alert(1)'), false);
  assert.equal(browseFn.isPublicHttpUrl('kein-url'), false);
});

test('isPrivateIp erkennt private/loopback/link-local IPs (v4, v6, mapped)', () => {
  assert.equal(browseFn.isPrivateIp('127.0.0.1'), true);
  assert.equal(browseFn.isPrivateIp('10.1.2.3'), true);
  assert.equal(browseFn.isPrivateIp('192.168.0.1'), true);
  assert.equal(browseFn.isPrivateIp('172.20.5.5'), true);
  assert.equal(browseFn.isPrivateIp('169.254.169.254'), true);
  assert.equal(browseFn.isPrivateIp('::1'), true);
  assert.equal(browseFn.isPrivateIp('fe80::1'), true);
  assert.equal(browseFn.isPrivateIp('fd00::1'), true);
  assert.equal(browseFn.isPrivateIp('::ffff:169.254.169.254'), true);
  assert.equal(browseFn.isPrivateIp('8.8.8.8'), false);
  assert.equal(browseFn.isPrivateIp('2606:4700:4700::1111'), false);
});

test('htmlToText entfernt Skripte/Tags und zieht den Titel', () => {
  const html = '<html><head><title>Mein &amp; Titel</title></head><body>'
    + '<script>evil()</script><style>.x{}</style>'
    + '<h1>Überschrift</h1><p>Erster Absatz.</p><p>Zweiter&nbsp;Absatz.</p></body></html>';
  const out = browseFn.htmlToText(html);
  assert.equal(out.title, 'Mein & Titel');
  assert.ok(!/evil|<script|<p>/.test(out.text));
  assert.match(out.text, /Überschrift/);
  assert.match(out.text, /Erster Absatz\./);
  assert.match(out.text, /Zweiter Absatz\./);
});

// Browser-IIFE aus js/browse.js für parseBrowseInput nachbilden.
let registered = null;
global.window = global;
global.Quantum = { skills: { register(def) { registered = def; } } };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/browse.js'), 'utf8'));
const browse = window.Quantum.browse;

test('Skill „browse" ist registriert', () => {
  assert.equal(registered.id, 'browse');
  assert.match(registered.name, /Web-Reader/);
});

test('parseBrowseInput trennt URL und Frage und ergänzt https://', () => {
  assert.deepEqual(browse.parseBrowseInput('https://example.com'), { url: 'https://example.com', question: '' });
  assert.deepEqual(browse.parseBrowseInput('example.com | Was kostet es?'), { url: 'https://example.com', question: 'Was kostet es?' });
  assert.deepEqual(browse.parseBrowseInput('  '), { url: '', question: '' });
  assert.equal(browse.parseBrowseInput('http://a.de | x').url, 'http://a.de');
});
