/* ═══════════════════════════════════════════════════════════════
   QUANTUM — SoulTrace-Skill (Persönlichkeitstest im Chat)
   Versucht zuerst die öffentliche SoulTrace-API; ist sie nicht
   erreichbar (CORS/Offline), läuft ein lokaler Kurztest nach dem
   gleichen 5-Farben-Prinzip. Antworten: Skala 1–7.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const API = 'https://soultrace.app/api/agent';

  const COLORS = {
    white: { de: 'Weiß', drive: 'Struktur & Fairness' },
    blue:  { de: 'Blau', drive: 'Verstehen & Präzision' },
    black: { de: 'Schwarz', drive: 'Ambition & Strategie' },
    red:   { de: 'Rot', drive: 'Intensität & Ausdruck' },
    green: { de: 'Grün', drive: 'Verbindung & Geduld' },
  };

  const ARCHETYP = {
    white: 'Architekt/in', blue: 'Analytiker/in', black: 'Stratege/in',
    red: 'Funke', green: 'Verbinder/in',
  };

  /* Lokaler Fallback: 15 eigene Fragen, 3 je Farbe */
  const LOCAL_QUESTIONS = [
    { c: 'white', t: 'Klare Regeln und verlässliche Abläufe geben mir Energie.' },
    { c: 'blue',  t: 'Ich will Dinge erst wirklich verstehen, bevor ich handle.' },
    { c: 'black', t: 'Ich setze mir ehrgeizige Ziele und verfolge sie konsequent.' },
    { c: 'red',   t: 'Ich sage direkt, was ich denke — auch wenn es aneckt.' },
    { c: 'green', t: 'Beziehungen zu pflegen ist mir wichtiger als Recht zu behalten.' },
    { c: 'white', t: 'Unordnung und gebrochene Absprachen stören mich stark.' },
    { c: 'blue',  t: 'Komplexe Systeme zu durchdringen macht mir Freude.' },
    { c: 'black', t: 'Ich übernehme gern die Führung, wenn niemand sonst entscheidet.' },
    { c: 'red',   t: 'Ich handle oft aus dem Bauch heraus und mit voller Energie.' },
    { c: 'green', t: 'Ich merke schnell, wie es anderen wirklich geht.' },
    { c: 'white', t: 'Fairness ist mir wichtiger als schnelle Ergebnisse.' },
    { c: 'blue',  t: 'Ich hinterfrage Annahmen, die andere einfach übernehmen.' },
    { c: 'black', t: 'Rückschläge spornen mich eher an, als dass sie mich bremsen.' },
    { c: 'red',   t: 'Routine langweilt mich — ich brauche Reibung und Neues.' },
    { c: 'green', t: 'Ich investiere lieber langfristig in Menschen als in schnelle Erfolge.' },
  ];

  const WORDS = [
    [/stimme (voll|absolut).*zu|absolut|auf jeden fall/i, 7],
    [/stimme zu|^ja\b|trifft zu/i, 6],
    [/eher ja|etwas|leicht.*zu/i, 5],
    [/neutral|teils|manchmal|weiß nicht/i, 4],
    [/eher nein|eher nicht/i, 3],
    [/stimme nicht zu|^nein\b|trifft nicht/i, 2],
    [/überhaupt nicht|gar nicht|absolut nicht/i, 1],
  ];

  let state = null; /* { mode:'api'|'local', answers:[], question, idx } */

  function parseScore(text) {
    const n = parseInt(text, 10);
    if (n >= 1 && n <= 7) return n;
    for (const [re, val] of WORDS) if (re.test(text)) return val;
    return null;
  }

  function scaleHint() {
    return '\n\nAntworte mit **1–7** (1 = stimme gar nicht zu · 4 = neutral · 7 = stimme voll zu). `stop` bricht ab.';
  }

  function apiCall(answers) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
      signal: ctrl.signal,
    }).then((r) => {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function pct(x) { return Math.round(x * 100) + ' %'; }

  function distToText(dist) {
    return Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => COLORS[c].de + ' ' + pct(v) + ' (' + COLORS[c].drive + ')')
      .join('\n');
  }

  function finishApi(data) {
    state = null;
    window.Quantum.engine.clearSession();
    const a = data.archetype || {};
    return [
      '🧬 **DEIN ERGEBNIS** — Archetyp: **' + (a.name || '?') + '**' +
        (a.alignmentScore ? ' (' + Math.round(a.alignmentScore) + ' % Übereinstimmung)' : ''),
      '',
      distToText(data.distribution || {}),
      '',
      data.resultUrl ? 'Vollständiges Ergebnis: ' + data.resultUrl : '',
    ].join('\n').trim();
  }

  function finishLocal() {
    const sums = { white: 0, blue: 0, black: 0, red: 0, green: 0 };
    state.answers.forEach((ans, i) => { sums[LOCAL_QUESTIONS[i].c] += ans; });
    const total = Object.values(sums).reduce((a, b) => a + b, 0) || 1;
    const dist = {};
    Object.keys(sums).forEach((c) => { dist[c] = sums[c] / total; });
    const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
    const [c1, c2] = [sorted[0][0], sorted[1][0]];
    state = null;
    window.Quantum.engine.clearSession();
    return [
      '🧬 **DEIN ERGEBNIS** (lokaler Kurztest)',
      'Dominante Farben: **' + COLORS[c1].de + ' + ' + COLORS[c2].de + '**',
      'Archetyp: **' + ARCHETYP[c1] + ' × ' + ARCHETYP[c2] + '**',
      '',
      distToText(dist),
      '',
      'Hinweis: Die SoulTrace-API war nicht erreichbar, daher lief die Kurzversion mit 15 Fragen direkt in deinem Browser.',
    ].join('\n');
  }

  function askLocal() {
    const q = LOCAL_QUESTIONS[state.idx];
    return '**Frage ' + (state.idx + 1) + '/' + LOCAL_QUESTIONS.length + ':** ' + q.t + scaleHint();
  }

  function askApi(data) {
    state.question = data.question;
    const p = data.progress || {};
    return '**Frage ' + ((p.answered || 0) + 1) + '/' + (p.total || 24) + ':** ' + data.question.text + scaleHint();
  }

  /* Session-Handler: bekommt jede Chat-Nachricht, solange der Test läuft */
  function onMessage(text) {
    if (!state) return undefined;
    if (/^(stop|abbruch|abbrechen|exit|\/stop)$/i.test(text.trim())) {
      state = null;
      window.Quantum.engine.clearSession();
      return 'Test abgebrochen. Deine Antworten wurden verworfen. 🧬';
    }
    if (text.startsWith('/')) return undefined; /* Befehle durchlassen */
    const score = parseScore(text.trim());
    if (score === null) {
      return 'Das habe ich nicht als Antwort erkannt.' + scaleHint();
    }
    if (state.mode === 'local') {
      state.answers.push(score);
      if (state.answers.length >= LOCAL_QUESTIONS.length) return finishLocal();
      state.idx++;
      return askLocal();
    }
    /* API-Modus */
    state.answers.push({ questionId: state.question.id, score });
    return apiCall(state.answers)
      .then((data) => (data.status === 'complete' ? finishApi(data) : askApi(data)))
      .catch(() => {
        /* API unterwegs weggebrochen → auf lokal umschalten */
        state = { mode: 'local', answers: [], idx: 0 };
        return '⚠️ Verbindung zur SoulTrace-API verloren — ich starte die lokale Kurzversion.\n\n' + askLocal();
      });
  }

  window.Quantum.skills.register({
    id: 'soultrace',
    icon: '🧬',
    name: 'SoulTrace-Persönlichkeit',
    desc: 'Persönlichkeitstest im Chat (5-Farben-Modell)',
    usage: '/skill soultrace',
    run() {
      if (state) return 'Der Test läuft schon — beantworte die aktuelle Frage oder tippe `stop`.';
      window.Quantum.engine.setSession(onMessage);
      return apiCall([])
        .then((data) => {
          state = { mode: 'api', answers: [], question: data.question };
          return '🧬 **SOULTRACE-TEST GESTARTET** (24 Fragen, live via soultrace.app)\n\n' + askApi(data);
        })
        .catch(() => {
          state = { mode: 'local', answers: [], idx: 0 };
          return '🧬 **SOULTRACE-KURZTEST GESTARTET** (15 Fragen, lokal — API nicht erreichbar)\n\n' + askLocal();
        });
    },
  });
})();
