/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Antwort-Engine
   Lokales Demo-Gehirn: Befehls-Router (/help, /skills, …) plus
   einfache Intent-Erkennung für Smalltalk. Komplett offline.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  /* Mini-Eventbus für Automationen & UI */
  const listeners = {};
  window.Quantum.bus = {
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); },
  };

  const GREETINGS = [
    'Hey! ⚡ Ich bin Quantum, dein AI Worker. Was bauen wir heute — oder soll ich erst einen Witz raushauen? (`witz`)',
    'Neural-Link stabil, Kaffee im Kern nachgefüllt. ☕ Was liegt an?',
    'Hallo! Meine Skills glühen schon. Wortwörtlich. Ich hab Neonröhren statt Nerven.',
    'Yo! 🤖 19 Skills, 0 schlechte Laune. Schieß los.',
  ];

  const FALLBACKS = [
    'Hmm, da muss ich passen — ich bin eine lokale Demo ohne echtes LLM-Hirn. Dafür stürze ich nie ab und werde nie frech. Na gut, selten. `/skills` zeigt, was ich WIRKLICH kann.',
    'Ehrlich gesagt: keine Ahnung. Aber ich sage es wenigstens mit Selbstbewusstsein. 😎 Probier `/help` — da glänze ich.',
    'Mein Quantenkern sagt dazu: „42“. Falls das nicht hilft: `/skill ideen` wirft dir sofort was Brauchbares zu.',
    'Das übersteigt meine Neonröhren-Kapazität. Für sowas würde man hier eine KI-API anschließen — bis dahin bin ich eher der Typ für Skills und schlechte Witze (`witz`).',
  ];

  /* Eigene Witze — handgeschmiedet im Quantum-Labor */
  const JOKES = [
    'Warum hat der Entwickler seinen Job im Neon-Schild-Laden gekündigt? Zu viel Burn-out. 💡',
    'Ich wollte einen Witz über UDP machen … aber ich weiß nicht, ob er ankommt.',
    'Mein Therapeut sagt, ich soll loslassen. Ich: `git reset --hard`. Er meinte das anders.',
    'Warum vertrauen Roboter keinen Treppen? Weil sie ständig etwas herunterladen. 🤖',
    'Es gibt 10 Arten von Menschen: die, die Binär verstehen, und die, die jetzt verwirrt sind.',
    'Ich habe einen Witz über Endlosschleifen. Ich habe einen Witz über Endlosschleifen. Ich habe…',
    'Warum war der CSS-Entwickler im Restaurant unglücklich? Der Tisch hatte kein padding.',
    'Chuck Norris braucht kein Passwort-Tool. Passwörter merken sich IHN. 🔐',
    'Mein Speicher ist lokal, meine Träume sind cloud-native.',
    'Debugging ist wie Detektiv spielen in einem Krimi, in dem du auch der Mörder bist.',
  ];

  const PRAISE_REPLIES = [
    'Stopp, ich werd noch rot. Also… magentafarbener als sonst. 😊⚡',
    'Danke! Ich tue, was ich kann — und was ich nicht kann, tue ich mit Zuversicht.',
    'Das geht runter wie flüssiges Neon. Nächste Aufgabe?',
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function helpText() {
    return [
      '📖 QUANTUM-BEFEHLE',
      '──────────────────',
      '`/help` — diese Übersicht',
      '`/skills` — alle Skills auflisten',
      '`/skill <name> <eingabe>` — Skill ausführen',
      '`/auto` — Automationen auflisten',
      '`/clear` — Chat leeren',
      '',
      'Skills kannst du links anklicken, Automationen rechts anlegen.',
      'Beispiel: `/skill rechner 42*10+2`',
    ].join('\n');
  }

  function skillsText() {
    const s = window.Quantum.skills;
    return '◈ VERFÜGBARE SKILLS\n──────────────────\n' + s.all.map(sk =>
      (s.isEnabled(sk.id) ? '🟢' : '⚫') + ' ' + sk.icon + ' **' + sk.name + '** — ' + sk.desc + '\n   ↳ `' + sk.usage + '`'
    ).join('\n');
  }

  function autosText() {
    const autos = window.Quantum.automations.all();
    if (!autos.length) return 'Noch keine Automationen. Leg rechts im Panel eine an! ⟳';
    return '⟳ DEINE AUTOMATIONEN\n──────────────────\n' + autos.map(a =>
      (a.paused ? '⏸' : '▶') + ' **' + a.name + '** — ' + window.Quantum.automations.describe(a)
    ).join('\n');
  }

  const INTENTS = [
    { re: /witz|joke|was lustiges|bring mich zum lachen|humor/i, fn: () => '😄 ' + pick(JOKES) },
    { re: /^(hi|hey|hallo|moin|servus|yo)\b/i, fn: () => pick(GREETINGS) },
    { re: /wie geht('?s| es dir)/i, fn: () => pick([
      'Alle Systeme im grünen Bereich. 🟢 Kerne kühl, Neonröhren warm. Und dir?',
      'Läuft bei mir — im wahrsten Sinne, ich bin ja Software. Und selbst? 😄',
      'Besser als mein Wetter-Skill vorhergesagt hat. Und bei dir?',
    ]) },
    { re: /wer bist du|was bist du|stell dich vor/i, fn: () => 'Ich bin **QUANTUM** 🤖 — dein AI Worker mit 19 Skills, Automationen und einer Schwäche für Neonlicht und flache Witze (`witz`). Ich laufe zu 100 % lokal in deinem Browser — deine Daten bleiben bei dir.' },
    { re: /was kannst du|deine (skills|fähigkeiten)/i, fn: skillsText },
    { re: /langweilig|mir ist langweilig/i, fn: () => 'Langeweile? Nicht in meiner Schicht. 😄 Optionen: `witz`, `/skill ideen`, `/skill wuerfel 3w20` oder `/skill soultrace` — finde raus, wer du wirklich bist.' },
    { re: /danke|nice|cool|geil|super|stark|klasse/i, fn: () => pick(PRAISE_REPLIES) },
    { re: /uhrzeit|wie spät/i, fn: () => '🕒 Es ist ' + new Date().toLocaleTimeString('de-DE') + '. Zeit für Großes. Oder für einen Kaffee.' },
    { re: /datum|welcher tag/i, fn: () => '📅 Heute ist ' + new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '.' },
    { re: /^[\d\s+\-*/().^%]+$/, fn: (text) => window.Quantum.skills.run('rechner', text) },
  ];

  /* ── KI-Chat (Groq/NVIDIA/OpenRouter via Gateway) ─────────────
     Ist ein KI-Zugangscode gesetzt, beantwortet das konfigurierte
     KI-Modell alle freien Fragen (Befehle und Skill-Sessions bleiben
     lokal). Ohne Zugang bleibt Quantum im lokalen Demo-Modus. */

  const PROVIDER_LABELS = { gemini: 'Gemini', groq: 'Groq', nvidia: 'NVIDIA/Qwen', openrouter: 'OpenRouter', custom: 'Custom-Gateway' };
  function providerLabel(id) {
    return PROVIDER_LABELS[String(id || '').toLowerCase()] || 'KI-Modell';
  }

  const CHAT_SYSTEM = [
    'Du bist QUANTUM, ein hilfsbereiter AI Worker mit Neon-Cyberpunk-Persönlichkeit:',
    'locker, präzise, gelegentlich ein trockener Witz. Antworte in der Sprache des',
    'Nutzers (meist Deutsch), kurz und konkret. Formatierung: nur **fett** und',
    '`code`, keine Überschriften, keine Links, kein HTML.',
  ].join(' ');

  const history = [];

  function remember(role, text) {
    history.push({ role, text: String(text).slice(0, 500) });
    if (history.length > 12) history.shift();
  }

  window.Quantum.bus.on('botmessage', (text) => remember('assistant', text));

  function aiAvailable() {
    const ai = window.Quantum.ai;
    return !!(ai && ai.hasAccess && ai.hasAccess());
  }

  function buildChatPrompt(text) {
    const lines = history.map((entry) =>
      (entry.role === 'user' ? 'Nutzer: ' : 'Quantum: ') + entry.text);
    lines.push('Nutzer: ' + text);
    lines.push('Quantum:');
    return lines.join('\n');
  }

  async function aiRespond(text) {
    try {
      const result = await window.Quantum.ai.ask({
        system: CHAT_SYSTEM,
        prompt: buildChatPrompt(text),
        temperature: 0.6,
        /* Genug Luft für Denk-Modelle, die vor der Antwort Reasoning-Tokens
           verbrauchen (z. B. gpt-oss); die Antwort selbst bleibt kurz. */
        maxTokens: 2500,
      });
      const parsed = window.Quantum.modelResponse.parse(result.text);
      const answer = (parsed.kind === 'html' ? parsed.html : parsed.text) || String(result.text);
      return answer.trim() || pick(FALLBACKS);
    } catch (error) {
      return '⚠️ ' + providerLabel(error.provider) + ' nicht erreichbar: ' + (error.message || 'unbekannter Fehler') +
        '\nLokale Antwort: ' + pick(FALLBACKS);
    }
  }

  /* Aktive Skill-Session (z. B. laufender Fragebogen): solange gesetzt,
     bekommt sie jede Nachricht zuerst; gibt sie undefined zurück,
     greift das normale Routing */
  let session = null;

  window.Quantum.engine = {
    greeting() { return pick(GREETINGS); },
    setSession(fn) { session = fn; },
    clearSession() { session = null; },
    hasSession() { return !!session; },

    /* Verarbeitet eine User-Nachricht und liefert die Antwort
       (String oder Promise<String>) */
    respond(raw) {
      const text = raw.trim();

      if (session) {
        const out = session(text);
        if (out !== undefined && out !== null) return out;
      }

      if (!text.startsWith('/')) remember('user', text);

      if (text.startsWith('/')) {
        const [cmd, ...rest] = text.slice(1).split(/\s+/);
        const arg = rest.join(' ');
        switch (cmd.toLowerCase()) {
          case 'help': return helpText();
          case 'skills': return skillsText();
          case 'auto':
          case 'autos':
          case 'automationen': return autosText();
          case 'skill': {
            const [id, ...input] = arg.split(/\s+/);
            if (!id) return 'Welchen Skill? Beispiel: `/skill wuerfel 3w6` — Liste mit `/skills`.';
            return window.Quantum.skills.run(id.toLowerCase(), input.join(' '));
          }
          case 'clear': return '__CLEAR__';
          default: return 'Unbekannter Befehl `/' + cmd + '`. Tippe `/help`.';
        }
      }

      /* Reine Rechenausdrücke immer sofort lokal lösen */
      if (/^[\d\s+\-*/().^%]+$/.test(text)) return window.Quantum.skills.run('rechner', text);

      /* Mit KI-Zugang gehen freie Fragen an das konfigurierte KI-Modell */
      if (aiAvailable()) return aiRespond(text);

      for (const intent of INTENTS) {
        if (intent.re.test(text)) return intent.fn(text);
      }
      return pick(FALLBACKS) +
        '\n\n💡 Tipp: Mit einem KI-Zugangscode (🔑 oben rechts) beantwortet das KI-Modell (z. B. Groq/Llama) solche Fragen live.';
    },
  };
})();
