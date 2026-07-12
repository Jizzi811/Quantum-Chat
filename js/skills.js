/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Skill-System
   Skills erweitern, was Quantum kann. Jeder Skill ist ein Objekt
   mit id, icon, name, desc und einer run(input)-Funktion.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  /* Sicherer Mini-Rechner: eigener Parser statt eval() */
  function calc(expr) {
    const tokens = expr.match(/\d+\.?\d*|[+\-*/()^%]/g);
    if (!tokens || tokens.join('').replace(/\s/g, '') !== expr.replace(/\s/g, '')) return null;
    let pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function parseNumber() {
      if (peek() === '(') {
        next();
        const v = parseExpr();
        if (peek() === ')') next();
        return v;
      }
      if (peek() === '-') { next(); return -parseNumber(); }
      const t = next();
      const n = parseFloat(t);
      return isNaN(n) ? null : n;
    }
    function parsePow() {
      let left = parseNumber();
      while (peek() === '^') { next(); left = Math.pow(left, parseNumber()); }
      return left;
    }
    function parseTerm() {
      let left = parsePow();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        const op = next();
        const right = parsePow();
        if (op === '*') left *= right;
        else if (op === '/') left /= right;
        else left %= right;
      }
      return left;
    }
    function parseExpr() {
      let left = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = next();
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }
    const result = parseExpr();
    return (pos === tokens.length && typeof result === 'number' && isFinite(result)) ? result : null;
  }

  const IDEA_SEEDS = [
    'Ein Newsletter, den eine KI jeden Morgen aus deinen offenen Tabs baut',
    'Ein Habit-Tracker, der Gewohnheiten als leuchtende Neon-Ringe visualisiert',
    'Ein Bot, der Rechnungen aus E-Mails zieht und automatisch ablegt',
    'Eine Landingpage, die sich nachts in den Dark-Mode "verwandelt"',
    'Ein Dashboard, das deine Social-Media-Reichweite als Sternenhimmel zeigt',
    'Ein Skill-Marktplatz, auf dem Nutzer eigene Automationen teilen',
    'Ein Fokus-Timer, der das UI umso ruhiger macht, je länger du dranbleibst',
    'Ein Preis-Wächter, der dich anpingt, sobald ein Produkt günstiger wird',
  ];

  const MOTIVATION = [
    'Systeme schlagen Motivation. Bau heute ein kleines System.',
    'Version 1 ist besser als Version niemals.',
    'Du musst nicht schneller arbeiten — du musst weniger manuell arbeiten.',
    'Automatisiere alles, was du dreimal getan hast.',
    'Große Dinge entstehen aus vielen kleinen Commits.',
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function summarize(text) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    if (sentences.length <= 2) return 'Der Text ist schon kompakt — kürzer geht kaum:\n» ' + text.trim();
    const words = {};
    text.toLowerCase().replace(/[^\wäöüß\s]/g, '').split(/\s+/).forEach(w => {
      if (w.length > 4) words[w] = (words[w] || 0) + 1;
    });
    const scored = sentences.map(s => {
      let score = 0;
      s.toLowerCase().split(/\s+/).forEach(w => { score += words[w.replace(/[^\wäöüß]/g, '')] || 0; });
      return { s: s.trim(), score };
    });
    const top = scored.sort((a, b) => b.score - a.score).slice(0, 2).map(x => x.s);
    return 'Kurzfassung (' + sentences.length + ' Sätze → 2):\n» ' + top.join('\n» ');
  }

  function makePassword(len) {
    const n = Math.min(Math.max(parseInt(len, 10) || 16, 8), 64);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-_?';
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < n; i++) out += chars[buf[i] % chars.length];
    return out;
  }

  const SKILLS = [
    {
      id: 'rechner', icon: '🧮', name: 'Neuro-Rechner',
      desc: 'Rechnet Ausdrücke wie 12*(3+4)^2',
      usage: '/skill rechner 12*(3+4)',
      run(input) {
        const r = calc(input.trim());
        return r === null
          ? 'Das konnte ich nicht rechnen. Beispiel: `/skill rechner 12*(3+4)^2`'
          : '⚡ Ergebnis: `' + input.trim() + ' = ' + r + '`';
      },
    },
    {
      id: 'ideen', icon: '💡', name: 'Ideen-Generator',
      desc: 'Wirft dir eine Produkt-/Projektidee zu',
      usage: '/skill ideen',
      run() { return '💡 Idee für dich:\n' + pick(IDEA_SEEDS); },
    },
    {
      id: 'zusammenfassen', icon: '📝', name: 'Text-Kompressor',
      desc: 'Fasst eingefügten Text auf 2 Kernsätze zusammen',
      usage: '/skill zusammenfassen <Text>',
      run(input) {
        return input.trim().length < 30
          ? 'Gib mir einen längeren Text: `/skill zusammenfassen <dein Text>`'
          : summarize(input);
      },
    },
    {
      id: 'passwort', icon: '🔐', name: 'Passwort-Schmiede',
      desc: 'Erzeugt ein starkes Zufallspasswort',
      usage: '/skill passwort 20',
      run(input) {
        return '🔐 Frisch geschmiedet:\n`' + makePassword(input) + '`\n(Nur lokal erzeugt — verlässt deinen Browser nicht.)';
      },
    },
    {
      id: 'wuerfel', icon: '🎲', name: 'Quanten-Würfel',
      desc: 'Würfelt, z. B. 3W6 oder Standard W20',
      usage: '/skill wuerfel 3w6',
      run(input) {
        const m = input.trim().toLowerCase().match(/^(\d*)\s*[wd]\s*(\d+)$/) || [null, '1', '20'];
        const count = Math.min(parseInt(m[1] || '1', 10), 20);
        const sides = Math.min(parseInt(m[2], 10) || 20, 1000);
        const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
        return '🎲 ' + count + 'W' + sides + ' → [ ' + rolls.join(' | ') + ' ]' + (count > 1 ? '  Σ ' + rolls.reduce((a, b) => a + b, 0) : '');
      },
    },
    {
      id: 'motivation', icon: '🔥', name: 'Hype-Modul',
      desc: 'Ein Schub Energie auf Abruf',
      usage: '/skill motivation',
      run() { return '🔥 ' + pick(MOTIVATION); },
    },
    {
      id: 'countdown', icon: '⏳', name: 'Zeit-Kristall',
      desc: 'Tage bis zu einem Datum (JJJJ-MM-TT)',
      usage: '/skill countdown 2026-12-31',
      run(input) {
        const d = new Date(input.trim() + 'T00:00:00');
        if (isNaN(d.getTime())) return 'Datum bitte als `JJJJ-MM-TT`, z. B. `/skill countdown 2026-12-31`';
        const days = Math.ceil((d - new Date()) / 86400000);
        if (days < 0) return '⏳ Das Datum liegt ' + Math.abs(days) + ' Tage in der Vergangenheit.';
        if (days === 0) return '⏳ Das ist HEUTE! 🎉';
        return '⏳ Noch **' + days + ' Tage** bis ' + d.toLocaleDateString('de-DE') + '.';
      },
    },
    {
      id: 'entscheider', icon: '⚖️', name: 'Orakel',
      desc: 'Entscheidet zwischen Optionen (a oder b oder c)',
      usage: '/skill entscheider Pizza oder Sushi',
      run(input) {
        const opts = input.split(/\s+oder\s+|,/i).map(s => s.trim()).filter(Boolean);
        if (opts.length < 2) return 'Gib mir Optionen: `/skill entscheider Pizza oder Sushi oder Salat`';
        return '⚖️ Das Orakel hat gesprochen: **' + pick(opts) + '**';
      },
    },
  ];

  const enabled = new Set(JSON.parse(localStorage.getItem('quantum.skills.enabled') || 'null') || SKILLS.map(s => s.id));
  const known = new Set(JSON.parse(localStorage.getItem('quantum.skills.known') || 'null') || SKILLS.map(s => s.id));

  function persist() {
    localStorage.setItem('quantum.skills.enabled', JSON.stringify([...enabled]));
    localStorage.setItem('quantum.skills.known', JSON.stringify([...known]));
  }

  window.Quantum.skills = {
    all: SKILLS,
    get(id) { return SKILLS.find(s => s.id === id); },
    isEnabled(id) { return enabled.has(id); },
    /* Nachträglich geladene Skills (eigene Module) registrieren;
       neue Skills starten aktiviert, auch wenn localStorage älter ist */
    register(skill) {
      if (SKILLS.some(s => s.id === skill.id)) return;
      SKILLS.push(skill);
      if (!known.has(skill.id)) {
        known.add(skill.id);
        enabled.add(skill.id);
        persist();
      }
    },
    toggle(id) {
      if (enabled.has(id)) enabled.delete(id); else enabled.add(id);
      persist();
      return enabled.has(id);
    },
    run(id, input) {
      const skill = this.get(id);
      if (!skill) return 'Unbekannter Skill `' + id + '`. Tippe `/skills` für die Liste.';
      if (!enabled.has(id)) return 'Skill „' + skill.name + '“ ist deaktiviert. Aktiviere ihn im Skills-Panel.';
      try {
        const out = skill.run(input || '');
        /* Async-Skills liefern ein Promise — Fehler dort ebenfalls abfangen */
        return (out && typeof out.then === 'function')
          ? out.catch((e) => '⚠️ Skill-Fehler: ' + e.message)
          : out;
      }
      catch (e) { return '⚠️ Skill-Fehler: ' + e.message; }
    },
  };
})();
