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

test('parseDuration liest Sekunden, Minuten und mm:ss und clamped', () => {
  assert.equal(video.parseDuration('10s Intro'), 10);
  assert.equal(video.parseDuration('30 sekunden Clip'), 30);
  assert.equal(video.parseDuration('2 min Doku'), 120);
  assert.equal(video.parseDuration('1:30 Trailer'), 90);
  assert.equal(video.parseDuration('kein Zeitwert hier'), 8); // Default
  assert.equal(video.parseDuration('999s'), 120);             // clamp Maximum
  assert.equal(video.parseDuration('1s'), 2);                 // clamp Minimum
});

test('stripForBrowser entfernt Imports und Exports, behält den Code', () => {
  const src = "import React from 'react';\n"
    + "import { AbsoluteFill } from 'remotion';\n"
    + 'export const MyVideo = () => null;\n';
  const out = video.stripForBrowser(src);
  assert.ok(!/\bimport\b/.test(out));
  assert.ok(!/\bexport\b/.test(out));
  assert.match(out, /const MyVideo = \(\) => null/);
});

test('rootTsx setzt Dauer und Format dynamisch', () => {
  const root = video.rootTsx(300, 30, 1920, 1080);
  assert.match(root, /durationInFrames=\{300\}/);
  assert.match(root, /fps=\{30\}/);
  assert.match(root, /width=\{1920\}/);
});

test('buildStudioHtml bettet React, Babel, Player und die Dauer ein', () => {
  const html = video.buildStudioHtml({ code: video.fallbackComposition('Hallo'), seconds: 6, fps: 30 });
  assert.match(html, /react@18/);
  assert.match(html, /react-dom@18/);
  assert.match(html, /@babel\/standalone/);
  assert.match(html, /type="text\/babel"/);
  assert.match(html, /"durationInFrames":180/); // 6s * 30fps
  assert.match(html, /Hallo/);
  assert.match(html, /__mountStudio/);
  // Imports im eingebetteten Composition-Code sind entfernt.
  assert.ok(!/import\s+\{\s*AbsoluteFill/.test(html));
});
