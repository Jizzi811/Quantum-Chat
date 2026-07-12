/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Code-Reviewer
   Statische Analyse direkt im Browser: Klammer-Balance,
   Sicherheits- und Stilregeln für JS/generischen Code, JSON-Check.
   Öffnet ein Editor-Overlay (mehrzeiliger Code passt nicht in die
   einzeilige Chat-Eingabe).
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  /* ── Klammer-Balance (String- und Kommentar-sensitiv) ──────── */

  const PAIRS = { ')': '(', ']': '[', '}': '{' };
  const NAMES = { '(': 'Klammer (', '[': 'Klammer [', '{': 'Klammer {' };

  function checkBrackets(code) {
    const issues = [];
    const stack = [];
    let line = 1, inStr = null, inLineC = false, inBlockC = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i], next = code[i + 1];
      if (ch === '\n') { line++; inLineC = false; if (inStr && inStr !== '`') inStr = null; continue; }
      if (inLineC) continue;
      if (inBlockC) { if (ch === '*' && next === '/') { inBlockC = false; i++; } continue; }
      if (inStr) {
        if (ch === '\\') { i++; continue; }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '/' && next === '/') { inLineC = true; i++; continue; }
      if (ch === '/' && next === '*') { inBlockC = true; i++; continue; }
      if (ch === '#' && 'python' === guessLang(code)) { inLineC = true; continue; }
      if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line });
      else if (ch === ')' || ch === ']' || ch === '}') {
        const open = stack.pop();
        if (!open) issues.push({ sev: 'error', line, msg: 'Schließende ' + ch + ' ohne passende öffnende Klammer' });
        else if (open.ch !== PAIRS[ch]) issues.push({ sev: 'error', line, msg: ch + ' passt nicht zu ' + NAMES[open.ch] + ' aus Zeile ' + open.line });
      }
    }
    stack.forEach((o) => issues.push({ sev: 'error', line: o.line, msg: NAMES[o.ch] + ' wird nie geschlossen' }));
    if (inBlockC) issues.push({ sev: 'error', line, msg: 'Blockkommentar /* wird nie geschlossen' });
    return issues;
  }

  /* ── Regelwerk (Zeile für Zeile) ───────────────────────────── */

  const RULES = [
    { re: /\beval\s*\(/, sev: 'error', msg: 'eval() — Sicherheitsrisiko, fast immer vermeidbar' },
    { re: /new\s+Function\s*\(/, sev: 'warn', msg: 'new Function() ist verstecktes eval()' },
    { re: /\bif\s*\(\s*[A-Za-z_$][\w$.]*\s*=\s*[^=]/, sev: 'error', msg: 'Zuweisung (=) statt Vergleich (===) in der Bedingung' },
    { re: /[^=!<>+\-*/%&|^]==[^=]/, sev: 'warn', msg: '== erzwingt Typ-Umwandlung — besser ===' },
    { re: /[^=!<>]!=[^=]/, sev: 'warn', msg: '!= erzwingt Typ-Umwandlung — besser !==' },
    { re: /\bvar\s+[A-Za-z_$]/, sev: 'hint', msg: 'var ist veraltet — let oder const nutzen' },
    { re: /\.innerHTML\s*\+?=/, sev: 'warn', msg: 'innerHTML mit dynamischen Daten = XSS-Gefahr — textContent oder Sanitizing nutzen' },
    { re: /document\.write\s*\(/, sev: 'warn', msg: 'document.write() blockiert das Rendering und ist unsicher' },
    { re: /catch\s*(\([^)]*\))?\s*\{\s*\}/, sev: 'warn', msg: 'Leerer catch-Block verschluckt Fehler lautlos' },
    { re: /console\.(log|debug|info)\s*\(/, sev: 'hint', msg: 'Debug-Ausgabe — vor Produktion entfernen?' },
    { re: /\b(TODO|FIXME|HACK)\b/, sev: 'hint', msg: 'Offener TODO/FIXME-Marker' },
    { re: /setTimeout\s*\(\s*["']/, sev: 'error', msg: 'setTimeout mit String ist eval() — Funktion übergeben' },
    { re: /(password|passwort|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{6,}["']/i, sev: 'error', msg: 'Hardcodiertes Secret im Code — in Umgebungsvariablen auslagern!' },
    { re: /(SELECT|INSERT|UPDATE|DELETE)\s.+(\+\s*[A-Za-z_$]|\$\{)/i, sev: 'error', msg: 'SQL per String-Verkettung = SQL-Injection-Gefahr — Prepared Statements nutzen' },
    { re: /\bexcept\s*:\s*$/, sev: 'warn', msg: 'Nacktes except: fängt ALLES — konkrete Exception angeben (Python)' },
    { re: /==\s*(True|False)\b/, sev: 'hint', msg: '== True/False ist unnötig — Wert direkt prüfen (Python)' },
  ];

  function guessLang(code) {
    if (/^\s*(def |import |from .+ import|class .+:)/m.test(code)) return 'python';
    if (/^\s*[{[]/.test(code.trim()) && !/function|=>|const |let /.test(code)) return 'json';
    return 'js';
  }

  function analyze(code) {
    const lang = guessLang(code);
    let issues = [];

    if (lang === 'json') {
      try { JSON.parse(code); return '✅ **JSON ist valide.** Keine Fehler gefunden.'; }
      catch (e) { return '🔴 **JSON-Fehler:** ' + e.message; }
    }

    issues = issues.concat(checkBrackets(code));
    const lines = code.split('\n');
    lines.forEach((text, i) => {
      if (/^\s*(\/\/|#|\*)/.test(text)) {
        if (/\b(TODO|FIXME|HACK)\b/.test(text)) issues.push({ sev: 'hint', line: i + 1, msg: 'Offener TODO/FIXME-Marker' });
        return;
      }
      RULES.forEach((rule) => {
        if (rule.re.test(text)) issues.push({ sev: rule.sev, line: i + 1, msg: rule.msg });
      });
      if (text.length > 140) issues.push({ sev: 'hint', line: i + 1, msg: 'Sehr lange Zeile (' + text.length + ' Zeichen) — aufteilen?' });
    });

    /* Duplikate (gleiche Regel + Zeile) entfernen und sortieren */
    const seen = new Set();
    issues = issues.filter((x) => {
      const key = x.line + '|' + x.msg;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.line - b.line);

    const errors = issues.filter((x) => x.sev === 'error');
    const warns = issues.filter((x) => x.sev === 'warn');
    const hints = issues.filter((x) => x.sev === 'hint');

    if (!issues.length) {
      return '✅ **CODE-REVIEW: SAUBER**\n' + lines.length + ' Zeilen geprüft (Sprache: ' + lang.toUpperCase() + ') — keine Auffälligkeiten. Stark! ⚡';
    }
    const fmt = (list) => list.map((x) => '· Zeile ' + x.line + ': ' + x.msg).join('\n');
    const score = Math.max(0, 100 - errors.length * 25 - warns.length * 10 - hints.length * 3);
    return [
      '🐛 **CODE-REVIEW** — ' + lines.length + ' Zeilen (' + lang.toUpperCase() + ') · Score: **' + score + '/100**',
      errors.length ? '\n🔴 **FEHLER (' + errors.length + ')**\n' + fmt(errors) : '',
      warns.length ? '\n🟡 **WARNUNGEN (' + warns.length + ')**\n' + fmt(warns) : '',
      hints.length ? '\n🔵 **HINWEISE (' + hints.length + ')**\n' + fmt(hints) : '',
      '\nHinweis: Statische Analyse findet typische Muster — Logikfehler prüft sie nicht.',
    ].filter(Boolean).join('\n');
  }

  /* ── Editor-Overlay ────────────────────────────────────────── */

  function openEditor() {
    if (document.getElementById('cr-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'cr-overlay';
    ov.className = 'cr-overlay';
    ov.innerHTML =
      '<div class="cr-box" role="dialog" aria-label="Code-Reviewer">' +
      '<div class="cr-box__head">🐛 CODE-REVIEWER — Code einfügen</div>' +
      '<textarea class="cr-box__code" id="cr-code" data-testid="codereview-textarea" spellcheck="false" placeholder="Code hier einfügen (JS, Python oder JSON) …"></textarea>' +
      '<div class="cr-box__actions">' +
      '<button class="cr-box__btn cr-box__btn--go" id="cr-go" data-testid="codereview-analyze-btn">⚡ ANALYSIEREN</button>' +
      '<button class="cr-box__btn" id="cr-close" data-testid="codereview-close-btn">SCHLIESSEN</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.getElementById('cr-close').addEventListener('click', close);
    document.getElementById('cr-go').addEventListener('click', () => {
      const code = document.getElementById('cr-code').value;
      if (!code.trim()) return;
      close();
      const ui = window.Quantum.ui;
      if (ui) {
        ui.system('Code-Review läuft (' + code.split('\n').length + ' Zeilen) …');
        ui.reply(analyze(code));
      }
    });
    document.getElementById('cr-code').focus();
  }

  window.Quantum.skills.register({
    id: 'codereview',
    icon: '🐛',
    name: 'Code-Reviewer',
    desc: 'Findet Fehler & Risiken in deinem Code',
    usage: '/skill codereview  (öffnet den Code-Editor)',
    run(input) {
      if (input.trim()) return analyze(input); /* Einzeiler direkt prüfen */
      openEditor();
      return '🐛 Code-Editor geöffnet — füg deinen Code ein und klick **⚡ ANALYSIEREN**. Geprüft werden u. a.: Klammer-Balance, eval/XSS/SQL-Injection-Muster, hardcodierte Secrets, ==-Fallen, leere catch-Blöcke.';
    },
  });
})();
