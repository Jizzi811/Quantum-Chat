# Presenton Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the self-hosted Presenton editor available as a separate Quantum tool and Diploi component.

**Architecture:** Railway runs the official Presenton image with a persistent volume mounted at `/app_data`. The existing Caddy server redirects `/presenton` to the Railway endpoint configured through `PRESENTON_URL`; a new Quantum skill opens that stable local route in a separate tab.

**Tech Stack:** Static HTML, browser JavaScript, Node.js built-in test runner, Caddy, Diploi, Presenton container image.

## Global Constraints

- Keep Presenton on Railway and the current static Quantum application on Diploi.
- Store model keys and the shared Presenton login only in deployment environment variables.
- Set `CAN_CHANGE_KEYS=false` and open Presenton in a new tab.
- Do not change the existing game-agent timer behavior.

---

### Task 1: Presentation Tool Skill

**Files:**
- Create: `js/presentation.js`
- Create: `tests/presentation.test.js`
- Modify: `index.html:360-361`

**Interfaces:**
- Produces: `window.Quantum.presentation = { url: '/presenton', open(): boolean }`
- Produces: a skill with id `praesentation` registered through `window.Quantum.skills.register`.

- [x] **Step 1: Write the failing test**

```js
test('Skill „praesentation" ist registriert und verweist auf Presenton', () => {
  assert.equal(registeredSkill.id, 'praesentation');
  assert.match(registeredSkill.name, /Presenton/);
  assert.equal(window.Quantum.presentation.url, '/presenton');
});

test('run() liefert einen Hinweistext mit dem lokalen Presenton-Link', () => {
  assert.match(registeredSkill.run(''), /PRAESENTATIONS-STUDIO/);
  assert.match(registeredSkill.run(''), /\/presenton/);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/presentation.test.js`

Expected: FAIL because `js/presentation.js` does not exist.

- [x] **Step 3: Add the minimal tool module and page script**

```js
const PRESENTON_URL = '/presenton';

function openPresentationStudio() {
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(PRESENTON_URL, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}
```

Register the `praesentation` skill with the icon `📊`, name `Präsentations-Studio (Presenton)`, and a German response that explains it creates and exports editable PPTX/PDF presentations. Load `js/presentation.js` after `js/editor.js` in `index.html`.

- [x] **Step 4: Run the focused skill tests**

Run: `node --test tests/presentation.test.js tests/editor.test.js`

Expected: PASS.

### Task 2: Presenton Railway Deployment and Redirect

**Files:**
- Modify: `diploi.yaml:6-27`
- Modify: `Caddyfile:5-15`
- Create: `PRESENTON_SETUP.md`

**Interfaces:**
- Consumes: the public Presenton endpoint from the `PRESENTON_URL` environment variable of the `static` component.
- Produces: a `PRESENTON_URL` configuration value pointing to the Railway deployment.
- Produces: `/presenton` redirect from Quantum to the configured endpoint.

- [x] **Step 1: Add a configuration test for the component manifest**

Add assertions to `tests/presentation.test.js` that read `diploi.yaml` and assert it contains `name: PRESENTON_URL` but no `identifier: presenton`. Assert that `PRESENTON_SETUP.md` requires Railway and `/app_data`.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/presentation.test.js`

Expected: FAIL because the Railway configuration is not documented.

- [x] **Step 3: Add the Presenton image wrapper and deployment configuration**

Keep only `PRESENTON_URL` on the `static` component. Configure Presenton through the official Railway template, with port `80` and a persistent volume mounted at `/app_data`.

Add this Caddy handler before `file_server`:

```caddyfile
@presenton path /presenton /presenton/
handle @presenton {
  redir {env.PRESENTON_URL} 302
}
```

Document the Railway volume mount, its Presenton environment values, and configuring `PRESENTON_URL` on the `static` component with the Railway domain.

- [x] **Step 4: Run the focused configuration tests**

Run: `node --test tests/presentation.test.js`

Expected: PASS.

### Task 3: Regression Verification

**Files:**
- Test: `tests/presentation.test.js`
- Test: `tests/editor.test.js`

**Interfaces:**
- Consumes: the registered skill and deployment manifest from Tasks 1 and 2.
- Produces: verification evidence for the Presenton entry point.

- [x] **Step 1: Run the relevant regression tests**

Run: `node --test tests/presentation.test.js tests/editor.test.js`

Expected: PASS.

- [x] **Step 2: Run the full test suite with enough time for the pre-existing game-agent timer**

Run: `npm test`

Expected: PASS, or the known baseline timeout behavior is reported separately if the test runner still cancels concurrent browser-global tests.
