const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fn = require('../netlify/functions/video-real.js');

/* ── Netlify-Function: reine Helfer ─────────────────────────────── */

test('buildInput trimmt den Prompt', () => {
  assert.deepEqual(fn.buildInput({ prompt: '  Ein Fuchs  ' }), { prompt: 'Ein Fuchs' });
  assert.deepEqual(fn.buildInput({}), { prompt: '' });
});

test('isValidRequestId akzeptiert UUID-artige IDs, blockt Injection', () => {
  assert.equal(fn.isValidRequestId('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), true);
  assert.equal(fn.isValidRequestId('short'), false);
  assert.equal(fn.isValidRequestId('../secret'), false);
  assert.equal(fn.isValidRequestId('id/with/slash-xxxxx'), false);
  assert.equal(fn.isValidRequestId(42), false);
});

test('parseSubmit zieht eine gültige request_id, sonst null', () => {
  assert.equal(fn.parseSubmit({ request_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }), 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  assert.equal(fn.parseSubmit({ request_id: 'bad' }), null);
  assert.equal(fn.parseSubmit({}), null);
});

test('parseStatus normiert und erkennt COMPLETED', () => {
  assert.deepEqual(fn.parseStatus({ status: 'IN_PROGRESS' }), { status: 'IN_PROGRESS', done: false });
  assert.deepEqual(fn.parseStatus({ status: 'completed' }), { status: 'COMPLETED', done: true });
  assert.deepEqual(fn.parseStatus({}), { status: 'UNKNOWN', done: false });
});

test('parseResult findet die Video-URL in verschiedenen Formen', () => {
  assert.equal(fn.parseResult({ video: { url: 'https://x/v.mp4' } }), 'https://x/v.mp4');
  assert.equal(fn.parseResult({ video_url: 'https://y/v.mp4' }), 'https://y/v.mp4');
  assert.equal(fn.parseResult({ videos: [{ url: 'https://z/v.mp4' }] }), 'https://z/v.mp4');
  assert.equal(fn.parseResult({ output: { video: { url: 'https://o/v.mp4' } } }), 'https://o/v.mp4');
  assert.equal(fn.parseResult({}), null);
  assert.equal(fn.parseResult(null), null);
});

test('statusUrl/resultUrl bauen die fal-Queue-URLs', () => {
  assert.equal(fn.statusUrl('abc-123-xyz9'), 'https://queue.fal.run/fal-ai/longcat-video/requests/abc-123-xyz9/status');
  assert.equal(fn.resultUrl('abc-123-xyz9'), 'https://queue.fal.run/fal-ai/longcat-video/requests/abc-123-xyz9');
  assert.match(fn.SUBMIT_URL, /queue\.fal\.run\/fal-ai\/longcat-video\/text-to-video\/720p$/);
});

/* ── Frontend-Client (IIFE) ─────────────────────────────────────── */

const registered = [];
global.window = global;
global.Quantum = { skills: { register(def) { registered.push(def); } } };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/video-real.js'), 'utf8'));
const vr = window.Quantum.videoReal;

test('Skills „video-real" und „video-status" sind registriert', () => {
  const ids = registered.map((s) => s.id);
  assert.ok(ids.includes('video-real'));
  assert.ok(ids.includes('video-status'));
  const main = registered.find((s) => s.id === 'video-real');
  assert.match(main.desc, /LongCat/);
});

test('formatReady enthält den Video-Link und den Kostenhinweis', () => {
  const out = vr.formatReady('https://cdn.fal/v.mp4');
  assert.match(out, /\[▶ Ansehen \/ herunterladen\]\(https:\/\/cdn\.fal\/v\.mp4\)/);
  assert.match(out, /0\.04/);
});

test('formatPending nennt die ID und den video-status-Befehl', () => {
  const out = vr.formatPending('req-12345678');
  assert.match(out, /req-12345678/);
  assert.match(out, /\/skill video-status req-12345678/);
});
