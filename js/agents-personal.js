/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Persönliche Agenten (lokal, localStorage)
   kalender: Termine anlegen, auflisten, löschen
   memory:   Fakten merken, abrufen, vergessen
   voice:    Sprachausgabe (Web Speech API) an/aus + Mikrofon
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  function load(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
  function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ── Kalender-Assistent ────────────────────────────────────── */

  const CAL_KEY = 'quantum.calendar';

  function parseWhen(text) {
    /* "morgen 15:00", "heute 9:30", "24.12. 18:00", "2026-08-01 10:00" */
    let d = new Date();
    let rest = text;
    const rel = text.match(/^(heute|morgen|übermorgen)\s+/i);
    if (rel) {
      const add = { heute: 0, morgen: 1, 'übermorgen': 2 }[rel[1].toLowerCase()];
      d.setDate(d.getDate() + add);
      rest = text.slice(rel[0].length);
    } else {
      const dm = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})?\s+/);
      const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+/);
      if (dm) {
        d = new Date(dm[3] ? parseInt(dm[3], 10) : d.getFullYear(), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10));
        if (!dm[3] && d < new Date()) d.setFullYear(d.getFullYear() + 1);
        rest = text.slice(dm[0].length);
      } else if (iso) {
        d = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
        rest = text.slice(iso[0].length);
      } else return null;
    }
    const tm = rest.match(/^(\d{1,2})[:.](\d{2})\s+/);
    if (tm) {
      d.setHours(parseInt(tm[1], 10), parseInt(tm[2], 10), 0, 0);
      rest = rest.slice(tm[0].length);
    } else d.setHours(9, 0, 0, 0);
    return rest.trim() ? { when: d, title: rest.trim() } : null;
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function listEvents() {
    const events = load(CAL_KEY).filter((e) => e.when >= Date.now() - 3600000).sort((a, b) => a.when - b.when);
    save(CAL_KEY, events);
    if (!events.length) return '📅 Keine anstehenden Termine. Anlegen: `/skill kalender morgen 15:00 Zahnarzt`';
    return '📅 **DEINE TERMINE**\n' + events.map((e, i) => (i + 1) + '. ' + fmtDate(e.when) + ' — ' + e.title).join('\n') +
      '\n\nLöschen mit `/skill kalender löschen 1`';
  }

  window.Quantum.skills.register({
    id: 'kalender', icon: '📅', name: 'Kalender-Assistent',
    desc: 'Termine anlegen und im Blick behalten',
    usage: '/skill kalender morgen 15:00 Zahnarzt',
    run(input) {
      const raw = input.trim();
      if (!raw || /^(liste|zeigen?)$/i.test(raw)) return listEvents();
      const del = raw.match(/^(löschen|delete)\s+(\d+)/i);
      if (del) {
        const events = load(CAL_KEY).sort((a, b) => a.when - b.when);
        const idx = parseInt(del[2], 10) - 1;
        if (!events[idx]) return 'Termin ' + del[2] + ' gibt es nicht. `/skill kalender` zeigt die Liste.';
        const gone = events.splice(idx, 1)[0];
        save(CAL_KEY, events);
        return '🗑 Termin gelöscht: ' + gone.title;
      }
      const parsed = parseWhen(raw);
      if (!parsed) return 'Format: `/skill kalender morgen 15:00 Zahnarzt` oder `24.12. 18:00 Weihnachtsessen`';
      const events = load(CAL_KEY);
      events.push({ when: parsed.when.getTime(), title: parsed.title });
      save(CAL_KEY, events);
      const inH = Math.round((parsed.when - Date.now()) / 3600000);
      return '📅 Gespeichert: **' + parsed.title + '** am ' + fmtDate(parsed.when) +
        (inH > 0 ? ' (in ~' + (inH >= 48 ? Math.round(inH / 24) + ' Tagen' : inH + ' Std.') + ')' : '');
    },
  });

  /* ── Memory-Agent ──────────────────────────────────────────── */

  const MEM_KEY = 'quantum.memory';

  window.Quantum.skills.register({
    id: 'memory', icon: '🧠', name: 'Memory-Agent',
    desc: 'Merkt sich Fakten über Sessions hinweg',
    usage: '/skill memory merke Mein Lieblingsstack ist React',
    run(input) {
      const raw = input.trim();
      const mem = load(MEM_KEY);
      if (!raw || /^(liste|zeigen?|alles)$/i.test(raw)) {
        if (!mem.length) return '🧠 Noch nichts gemerkt. `/skill memory merke <Fakt>`';
        return '🧠 **GEMERKT (' + mem.length + ')**\n' + mem.map((m, i) => (i + 1) + '. ' + m.text +
          ' _(' + new Date(m.at).toLocaleDateString('de-DE') + ')_').join('\n');
      }
      const forget = raw.match(/^(vergiss|vergessen|delete)\s+(\d+)/i);
      if (forget) {
        const idx = parseInt(forget[2], 10) - 1;
        if (!mem[idx]) return 'Eintrag ' + forget[2] + ' gibt es nicht.';
        const gone = mem.splice(idx, 1)[0];
        save(MEM_KEY, mem);
        return '🧠 Vergessen: „' + gone.text + '“';
      }
      const remember = raw.match(/^(merke?|merken|remember)\s+(.+)/i);
      if (remember) {
        mem.push({ text: remember[2].trim(), at: Date.now() });
        save(MEM_KEY, mem);
        return '🧠 Gemerkt: „' + remember[2].trim() + '“ (' + mem.length + ' Einträge insgesamt)';
      }
      /* Suche */
      const found = mem.filter((m) => m.text.toLowerCase().includes(raw.toLowerCase()));
      return found.length
        ? '🧠 Dazu weiß ich:\n' + found.map((m) => '· ' + m.text).join('\n')
        : '🧠 Dazu habe ich nichts gespeichert. `/skill memory merke ' + raw + ' ist …`';
    },
  });

  /* ── Voice-Agent ───────────────────────────────────────────── */

  const VOICE_KEY = 'quantum.voice';
  const VOICE_STYLE_KEY = 'quantum.voice.style';
  /* Feste „Quantum"-Stimme als VoxCPM-Voice-Design-Prompt, damit die Ausgabe
     immer gleich klingt. Über /skill voice stimme <…> anpassbar. */
  const DEFAULT_VOICE_STYLE = 'Eine ruhige, freundliche und selbstbewusste deutsche Stimme mit warmem, leicht futuristischem Klang, deutliche Aussprache.';

  let voiceOn = localStorage.getItem(VOICE_KEY) === '1';
  let currentAudio = null;
  let speakSeq = 0;
  /* Voice-Support-Loop: kam die letzte Frage per Diktat, hört Quantum
     nach dem Vorlesen der Antwort automatisch wieder zu. */
  let handsFree = false;
  let startListening = null;

  function resumeListening() {
    if (voiceOn && handsFree && startListening) startListening();
  }

  function voiceStyle() {
    try { return localStorage.getItem(VOICE_STYLE_KEY) || DEFAULT_VOICE_STYLE; } catch (_) { return DEFAULT_VOICE_STYLE; }
  }

  function cleanForSpeech(text) {
    return String(text).replace(/[*_`#]|https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (currentAudio) { try { currentAudio.pause(); } catch (_) { /* egal */ } currentAudio = null; }
  }

  function speakBrowser(text) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 1.05;
    utterance.onend = resumeListening;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  /* Primär: VoxCPM mit fester Quantum-Stimme. Kommt nichts zurück (Server
     nicht erreichbar), greift die schnelle Browser-Stimme als Notnagel. */
  async function speakVox(text, seq) {
    const tts = window.Quantum.ttsStudio;
    if (!tts || !tts.generate) { speakBrowser(text); return; }
    try {
      /* Kürzeres Zeitlimit im Gesprächs-Modus: reagiert VoxCPM nicht schnell
         (schlafender Demo-Server), springt unten die Browser-Stimme ein,
         statt den Nutzer minutenlang im Stillen warten zu lassen. */
      const result = await tts.generate({ text, instruction: voiceStyle(), cfg: 2.0, steps: 10, timeout: 20000 });
      if (!voiceOn || seq !== speakSeq) return; /* abgeschaltet oder neuere Nachricht */
      const audio = new Audio(result.url);
      currentAudio = audio;
      audio.onended = resumeListening;
      audio.play().catch(() => { if (voiceOn && seq === speakSeq) speakBrowser(text); });
    } catch (_) {
      if (voiceOn && seq === speakSeq) speakBrowser(text);
    }
  }

  function speak(text) {
    if (!voiceOn) return;
    const clean = cleanForSpeech(text);
    if (!clean) return;
    stopSpeaking();
    speakVox(clean, ++speakSeq);
  }

  window.Quantum.bus.on('botmessage', speak);

  /* Sichtbarer Umschalter im Header (🔈/🔊). Hält Status, Skill und
     Button synchron — egal ob per Klick oder /skill voice geschaltet. */
  function updateVoiceButton() {
    const btn = document.getElementById('btn-voice');
    if (!btn) return;
    btn.textContent = voiceOn ? '🔊' : '🔈';
    btn.setAttribute('aria-pressed', voiceOn ? 'true' : 'false');
    btn.classList.toggle('q-status__key--on', voiceOn);
    btn.title = voiceOn
      ? 'Sprachausgabe AN — klicken zum Ausschalten'
      : 'Sprachausgabe AUS — klicken, damit Quantum Antworten vorliest';
  }

  function setVoice(on, opts) {
    opts = opts || {};
    voiceOn = !!on;
    try { localStorage.setItem(VOICE_KEY, voiceOn ? '1' : '0'); } catch (_) { /* egal */ }
    if (!voiceOn) { stopSpeaking(); handsFree = false; }
    updateVoiceButton();
    /* Beim Einschalten per Klick sofort hörbar bestätigen: der Klick ist
       eine User-Geste, daher darf Audio abspielen. Die Browser-Stimme
       reagiert sofort; VoxCPM übernimmt ab der nächsten echten Antwort. */
    if (voiceOn && opts.confirm) {
      speakBrowser('Sprachausgabe aktiviert. Ich lese dir meine Antworten ab jetzt vor.');
    }
  }

  const voiceBtn = document.getElementById('btn-voice');
  if (voiceBtn) {
    updateVoiceButton();
    voiceBtn.addEventListener('click', () => {
      setVoice(!voiceOn, { confirm: !voiceOn });
      if (window.Quantum.ui && window.Quantum.ui.system) {
        window.Quantum.ui.system(voiceOn
          ? '🔊 Sprachausgabe **AN** — Quantum liest Antworten vor (VoxCPM-Stimme, Browser-Stimme als schneller Notnagel). Nochmal klicken schaltet ab.'
          : '🔈 Sprachausgabe **AUS**.');
      }
    });
  }

  window.Quantum.skills.register({
    id: 'voice', icon: '🎙', name: 'Voice-Agent',
    desc: 'Quantum spricht Antworten mit VoxCPM-Stimme (an/aus)',
    usage: '/skill voice  ·  /skill voice stimme <Beschreibung>',
    run(input) {
      const raw = String(input || '').trim();

      if (/^(reset|stimme\s+reset)$/i.test(raw)) {
        try { localStorage.removeItem(VOICE_STYLE_KEY); } catch (_) { /* egal */ }
        return '🎙 Quantum-Stimme auf Standard zurückgesetzt.';
      }
      const style = raw.match(/^stimme\s+(.+)/i);
      if (style) {
        try { localStorage.setItem(VOICE_STYLE_KEY, style[1].trim()); } catch (_) { /* egal */ }
        return '🎙 Quantum-Stimme angepasst: „' + style[1].trim() + '". Gilt ab der nächsten Antwort (bei aktiver Sprachausgabe).';
      }

      setVoice(!voiceOn, { confirm: false });
      return voiceOn
        ? '🎙 Sprachausgabe **AN** — Quantum spricht mit **VoxCPM-Stimme**. Diktierst du eine Frage über das 🎤, sende ich sie direkt ab und höre nach der Antwort wieder zu (Freisprech-Loop wie ein Support-Bot). Hinweis: Über den kostenlosen Demo-Server kann die erste Antwort einige Sekunden bis 1–2 Minuten dauern (Kaltstart). Klang ändern: `/skill voice stimme <Beschreibung>`. Nochmal `/skill voice` schaltet ab.'
        : '🎙 Sprachausgabe **AUS**.';
    },
  });

  /* Mikrofon-Diktat (sofern der Browser SpeechRecognition kann) */
  document.addEventListener('DOMContentLoaded', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('btn-mic');
    if (!btn) return;
    if (!SR) { btn.hidden = true; return; }
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    let listening = false;
    /* Manuell gesendete Nachrichten beenden den Freisprech-Loop;
       Diktat-Eingaben (unten) aktivieren ihn direkt danach wieder. */
    const form = document.getElementById('chat-form');
    if (form) form.addEventListener('submit', () => { handsFree = false; });
    rec.onresult = (e) => {
      const field = document.getElementById('chat-input-field');
      field.value = e.results[0][0].transcript;
      field.focus();
      /* Voice-Modus an: diktierte Frage direkt absenden (Support-Bot-Loop) */
      if (voiceOn && form && field.value.trim()) {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true }));
        handsFree = true;
      }
    };
    rec.onend = () => { listening = false; btn.classList.remove('is-listening'); };
    startListening = () => {
      if (listening) return;
      listening = true;
      btn.classList.add('is-listening');
      try { rec.start(); } catch (_) { listening = false; btn.classList.remove('is-listening'); }
    };
    btn.addEventListener('click', () => {
      if (listening) { handsFree = false; rec.stop(); return; }
      startListening();
    });
  });
})();
