const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const presentationPath = path.join(__dirname, '../js/presentation.js');
let registeredSkill = null;

test('Skill „praesentation" registriert den Presenton-Tab-Öffner', () => {
  assert.equal(fs.existsSync(presentationPath), true, 'presentation skill module missing');

  global.window = global;
  global.Quantum = { skills: { register(def) { registeredSkill = def; } } };
  vm.runInThisContext(fs.readFileSync(presentationPath, 'utf8'));

  assert.equal(registeredSkill.id, 'praesentation');
  assert.match(registeredSkill.name, /Presenton/);
  assert.equal(window.Quantum.presentation.url, '/presenton');
  assert.equal(typeof window.Quantum.presentation.open, 'function');
});

test('Skill „praesentation" erklärt den Presenton-Link', () => {
  assert.ok(registeredSkill, 'presentation skill should be registered by the module test');
  const output = registeredSkill.run('');
  assert.match(output, /PRAESENTATIONS-STUDIO/);
  assert.match(output, /\/presenton/);
});

test('Diploi konfiguriert Presenton als eigenen geschützten Service', () => {
  const manifest = fs.readFileSync(path.join(__dirname, '../diploi.yaml'), 'utf8');
  assert.match(manifest, /identifier: presenton/);
  assert.match(manifest, /folder: presenton/);
  assert.match(manifest, /name: CAN_CHANGE_KEYS/);
  assert.match(manifest, /name: AUTH_PASSWORD/);
});

test('Caddy leitet den lokalen Presenton-Link an die Service-URL weiter', () => {
  const caddyfile = fs.readFileSync(path.join(__dirname, '../Caddyfile'), 'utf8');
  assert.match(caddyfile, /handle \/presenton/);
  assert.match(caddyfile, /redir \{env\.PRESENTON_URL\} 302/);
});
