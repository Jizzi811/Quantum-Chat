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

/* ── E-Mail-gebundene Konten (QUANTUM_ACCESS_ACCOUNTS) ──────────── */

test('accessAccounts liest E-Mail:Code-Paare (Komma/Semikolon/Zeile)', () => {
  withEnv({ QUANTUM_ACCESS_ACCOUNTS: 'anna@x.de:code-a, ben@y.de:code-b;carla@z.de:code-c\ndan@w.de:code-d' }, () => {
    assert.deepEqual(shared.accessAccounts(), [
      { email: 'anna@x.de', code: 'code-a' },
      { email: 'ben@y.de', code: 'code-b' },
      { email: 'carla@z.de', code: 'code-c' },
      { email: 'dan@w.de', code: 'code-d' },
    ]);
  });
});

test('accessAccounts normalisiert E-Mail (trim/lowercase) und ignoriert unvollständige Einträge', () => {
  withEnv({ QUANTUM_ACCESS_ACCOUNTS: '  Anna@X.DE : code-a , kaputt-ohne-code, :nurcode, ben@y.de: ' }, () => {
    assert.deepEqual(shared.accessAccounts(), [{ email: 'anna@x.de', code: 'code-a' }]);
  });
});

test('accessAccounts entfernt versehentlich mitkopierten Variablennamen', () => {
  withEnv({ QUANTUM_ACCESS_ACCOUNTS: 'QUANTUM_ACCESS_ACCOUNTS=anna@x.de:code-a' }, () => {
    assert.deepEqual(shared.accessAccounts(), [{ email: 'anna@x.de', code: 'code-a' }]);
  });
});

test('isValidAccount akzeptiert nur das passende E-Mail+Code-Paar', () => {
  withEnv({ QUANTUM_ACCESS_ACCOUNTS: 'anna@x.de:code-a, ben@y.de:code-b' }, () => {
    assert.equal(shared.isValidAccount('anna@x.de', 'code-a'), true);
    assert.equal(shared.isValidAccount('ANNA@x.de', 'code-a'), true);  // E-Mail case-insensitiv
    assert.equal(shared.isValidAccount('anna@x.de', 'code-b'), false); // fremder Code
    assert.equal(shared.isValidAccount('ben@y.de', 'code-a'), false);  // vertauscht
    assert.equal(shared.isValidAccount('', 'code-a'), false);
    assert.equal(shared.isValidAccount('anna@x.de', ''), false);
  });
});

test('isValidAccessCredential: reiner Code (abwärtskompatibel) und E-Mail|Code', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: 'master', QUANTUM_ACCESS_TOKENS: 'legacy-1', QUANTUM_ACCESS_ACCOUNTS: 'anna@x.de:code-a' }, () => {
    assert.equal(shared.isValidAccessCredential('master'), true);           // Master-Code allein
    assert.equal(shared.isValidAccessCredential('legacy-1'), true);         // Listen-Code allein
    assert.equal(shared.isValidAccessCredential('anna@x.de|code-a'), true); // Konto-Paar
    assert.equal(shared.isValidAccessCredential('anna@x.de|master'), true); // Master mit E-Mail
    assert.equal(shared.isValidAccessCredential('code-a'), false);          // Konto-Code OHNE E-Mail → gesperrt
    assert.equal(shared.isValidAccessCredential('fremd@x.de|code-a'), false); // falsche E-Mail
    assert.equal(shared.isValidAccessCredential('anna@x.de|falsch'), false);  // falscher Code
    assert.equal(shared.isValidAccessCredential(''), false);
  });
});

test('accessConfigured erkennt Codes ODER Konten', () => {
  withEnv({ QUANTUM_ACCESS_TOKEN: undefined, QUANTUM_ACCESS_TOKENS: undefined, QUANTUM_ACCESS_ACCOUNTS: undefined }, () => {
    assert.equal(shared.accessConfigured(), false);
  });
  withEnv({ QUANTUM_ACCESS_TOKEN: undefined, QUANTUM_ACCESS_TOKENS: undefined, QUANTUM_ACCESS_ACCOUNTS: 'anna@x.de:code-a' }, () => {
    assert.equal(shared.accessConfigured(), true);
  });
});
