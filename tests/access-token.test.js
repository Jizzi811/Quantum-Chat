const test = require('node:test');
const assert = require('node:assert/strict');
const shared = require('../netlify/functions/quantum-shared.js');

function withEnv(vars, fn) {
  const saved = {};
  for (const key of Object.keys(vars)) { saved[key] = process.env[key]; }
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return fn(); }
  finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('accessTokenList enthält den primären Code', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: 'primary', QUANTUM_ACCESS_TOKENS: undefined }, () => {
    assert.deepEqual(shared.accessTokenList(), ['primary']);
  });
});

test('accessTokenList nimmt die selbst verwaltete Liste dazu (Komma/Semikolon/Zeile)', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: 'primary', QUANTUM_ACCESS_TOKENS: 'a1, b2;c3\nd4' }, () => {
    assert.deepEqual(shared.accessTokenList(), ['primary', 'a1', 'b2', 'c3', 'd4']);
  });
});

test('accessTokenList dedupliziert und ignoriert Leereinträge', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: 'x', QUANTUM_ACCESS_TOKENS: 'x, , y ,y' }, () => {
    assert.deepEqual(shared.accessTokenList(), ['x', 'y']);
  });
});

test('accessTokenList funktioniert auch ohne primären Code (nur Liste)', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: undefined, QUANTUM_ACCESS_TOKENS: 'only1,only2' }, () => {
    assert.deepEqual(shared.accessTokenList(), ['only1', 'only2']);
  });
});

test('accessTokenList entfernt versehentlich mitkopierten Variablennamen', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: undefined, QUANTUM_ACCESS_TOKENS: 'QUANTUM_ACCESS_TOKENS=a1,b2' }, () => {
    assert.deepEqual(shared.accessTokenList(), ['a1', 'b2']);
  });
});

test('isValidAccessToken akzeptiert primären Code und Listen-Codes', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: 'master', QUANTUM_ACCESS_TOKENS: 'kunde-a,kunde-b' }, () => {
    assert.equal(shared.isValidAccessToken('master'), true);
    assert.equal(shared.isValidAccessToken('kunde-a'), true);
    assert.equal(shared.isValidAccessToken('kunde-b'), true);
  });
});

test('isValidAccessToken lehnt falsche/leere Codes ab', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: 'master', QUANTUM_ACCESS_TOKENS: 'kunde-a' }, () => {
    assert.equal(shared.isValidAccessToken('falsch'), false);
    assert.equal(shared.isValidAccessToken(''), false);
    assert.equal(shared.isValidAccessToken(undefined), false);
    assert.equal(shared.isValidAccessToken('kunde-a '), false); // exakt, keine Teiltreffer
  });
});
