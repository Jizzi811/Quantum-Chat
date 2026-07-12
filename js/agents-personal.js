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

  let voiceOn = localStorage.getItem('quantum.voice') === '1';

  function speak(text) {
    if (!voiceOn || !('speechSynthesis' in window)) return;
    const clean = text.replace(/[*_`#]|https?:\/\/\S+/g, '').slice(0, 400);
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'de-DE';
    u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  window.Quantum.bus.on('botmessage', speak);

  window.Quantum.skills.register({
    id: 'voice', icon: '🎙', name: 'Voice-Agent',
    desc: 'Quantum spricht Antworten laut (an/aus)',
    usage: '/skill voice',
    run() {
      if (!('speechSynthesis' in window)) return '🎙 Dein Browser unterstützt keine Sprachausgabe.';
      voiceOn = !voiceOn;
      localStorage.setItem('quantum.voice', voiceOn ? '1' : '0');
      if (!voiceOn) speechSynthesis.cancel();
      return voiceOn
        ? '🎙 Sprachausgabe **AN** — ich lese meine Antworten jetzt vor. Mit dem 🎤 neben dem Eingabefeld kannst du auch diktieren (falls dein Browser es unterstützt). Nochmal `/skill voice` schaltet ab.'
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
    rec.onresult = (e) => {
      const field = document.getElementById('chat-input-field');
      field.value = e.results[0][0].transcript;
      field.focus();
    };
    rec.onend = () => { listening = false; btn.classList.remove('is-listening'); };
    btn.addEventListener('click', () => {
      if (listening) { rec.stop(); return; }
      listening = true;
      btn.classList.add('is-listening');
      rec.start();
    });
  });
})();
