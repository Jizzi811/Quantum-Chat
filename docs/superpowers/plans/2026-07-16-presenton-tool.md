# Presenton Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the self-hosted Presenton editor available as a separate Quantum tool and Diploi component.

**Architecture:** A `presenton` static component runs the official Presenton image on port 3000 with a persistent application-data volume provided by the component. The existing Caddy server redirects `/presenton` to the service endpoint configured through `PRESENTON_URL`; a new Quantum skill opens that stable local route in a separate tab.

**Tech Stack:** Static HTML, browser JavaScript, Node.js built-in test runner, Caddy, Diploi, Presenton container image.

## Global Constraints

- Keep Presenton and the current static Quantum application in separate containers.
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

### Task 2: Presenton Component and Redirect

**Files:**
- Create: `presenton/Dockerfile`
- Modify: `diploi.yaml:6-27`
- Modify: `Caddyfile:5-15`
- Create: `PRESENTON_SETUP.md`

**Interfaces:**
- Consumes: the public Presenton endpoint from the `PRESENTON_URL` environment variable of the `static` component.
- Produces: a `presenton` Diploi component listening on port 3000.
- Produces: `/presenton` redirect from Quantum to the configured endpoint.

- [x] **Step 1: Add a configuration test for the component manifest**

Add assertions to `tests/presentation.test.js` that read `diploi.yaml` and assert it contains `identifier: presenton`, `folder: presenton`, `name: CAN_CHANGE_KEYS`, and `name: AUTH_PASSWORD`.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/presentation.test.js`

Expected: FAIL because the Presenton component is not declared.

- [x] **Step 3: Add the Presenton image wrapper and deployment configuration**

Use this Dockerfile:

```dockerfile
FROM ghcr.io/presenton/presenton:latest

RUN sed -i 's/listen 80;/listen 3000;/' /etc/nginx/nginx.conf

EXPOSE 3000
```

Add a second `Static Website` component with identifier and folder `presenton`. Declare these environment names for its deployment configuration: `LLM`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `IMAGE_PROVIDER`, `PIXABAY_API_KEY`, `CAN_CHANGE_KEYS`, `AUTH_USERNAME`, `AUTH_PASSWORD`, `DISABLE_ANONYMOUS_TRACKING`.

Add this Caddy handler before `file_server`:

```caddyfile
handle /presenton {
  redir {env.PRESENTON_URL} 302
}
```

Document the required environment values in `PRESENTON_SETUP.md`, including configuring `PRESENTON_URL` on the `static` component to Presenton's public Diploi endpoint and `CAN_CHANGE_KEYS=false` on the `presenton` component.

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
