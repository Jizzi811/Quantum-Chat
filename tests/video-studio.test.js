const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser-Umgebung für das IIFE in js/video-studio.js nachbilden.
let registeredSkill = null;
global.window = global;
global.Quantum = { skills: { register(def) { registeredSkill = def; } } };

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/video-studio.js'), 'utf8'));
const video = window.Quantum.videoStudio;

test('Skill „video" ist registriert', () => {
  assert.equal(registeredSkill.id, 'video');
  assert.match(registeredSkill.name, /Remotion/);
});

test('extractCode zieht einen tsx-Codeblock mit Remotion-Bezug', () => {
  const answer = 'Klar!\n```tsx\nimport { AbsoluteFill } from "remotion";\nexport const MyVideo = () => null;\n```\nFertig.';
  const code = video.extractCode(answer);
  assert.match(code, /import \{ AbsoluteFill \} from "remotion"/);
  assert.match(code, /export const MyVideo/);
});

test('extractCode lehnt Antworten ohne Remotion/Export ab', () => {
  assert.equal(video.extractCode('Nur Text, kein Code.'), null);
  assert.equal(video.extractCode('```tsx\nconst x = 1;\n```'), null); // kein export/remotion
});

test('fallbackComposition liefert gültigen Remotion-Code mit Titel', () => {
  const code = video.fallbackComposition('Mein Intro');
  assert.match(code, /from 'remotion'/);
  assert.match(code, /export const MyVideo/);
  assert.match(code, /Mein Intro/);
  assert.match(code, /powered by NADJ\.AI/);
});

test('fallbackComposition entschärft gefährliche Zeichen im Titel', () => {
  const code = video.fallbackComposition('a`b$c\\d');
  // Der Titel wird bereinigt zu "abcd" in den <h1> eingesetzt.
  assert.match(code, />abcd</);
  assert.ok(!code.includes('a`b$c'));
});
