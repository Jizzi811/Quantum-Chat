/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Übersetzer
   KI-gestützter Übersetzer als Übersicht-Tab und als Chat-Skill
   (/skill uebersetzer). Nutzt das vorhandene Gateway-Modell
   (window.Quantum.ai) — kein zusätzlicher API-Key.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  /* Bekannte Zielsprachen für die Chat-Eingabe (Code oder Name als Präfix). */
  const LANGS = {
    de: 'Deutsch', deutsch: 'Deutsch', german: 'Deutsch',
    en: 'Englisch', englisch: 'Englisch', english: 'Englisch',
    fr: 'Französisch', französisch: 'Französisch', french: 'Französisch',
    es: 'Spanisch', spanisch: 'Spanisch', spanish: 'Spanisch',
    it: 'Italienisch', italienisch: 'Italienisch', italian: 'Italienisch',
    tr: 'Türkisch', türkisch: 'Türkisch', turkish: 'Türkisch',
    ru: 'Russisch', russisch: 'Russisch', russian: 'Russisch',
    ar: 'Arabisch', arabisch: 'Arabisch', arabic: 'Arabisch',
    zh: 'Chinesisch', chinesisch: 'Chinesisch', chinese: 'Chinesisch',
    ja: 'Japanisch', japanisch: 'Japanisch', japanese: 'Japanisch',
    pt: 'Portugiesisch', portugiesisch: 'Portugiesisch', portuguese: 'Portugiesisch',
    nl: 'Niederländisch', niederländisch: 'Niederländisch', dutch: 'Niederländisch',
    pl: 'Polnisch', polnisch: 'Polnisch', polish: 'Polnisch',
  };

  /* Zerlegt eine Chat-Eingabe wie „en: Hallo Welt“ in Zielsprache + Text.
     Ohne erkanntes Präfix bleibt die Zielsprache leer (= automatisch). Reine Funktion. */
  function parseTarget(input) {
    const raw = String(input || '').trim();
    const m = raw.match(/^([a-zA-ZäöüÄÖÜ]{2,14})\s*:\s*([\s\S]+)$/);
    if (m) {
      const key = m[1].toLowerCase();
      if (LANGS[key]) return { target: LANGS[key], text: m[2].trim() };
    }
    return { target: '', text: raw };
  }

  /* Baut den KI-Request für eine Übersetzung. Reine Funktion. */
  function buildRequest(text, target) {
    const dest = target && target.trim()
      ? target.trim()
      : 'Deutsch (falls der Text bereits Deutsch ist, stattdessen ins Englische)';
    return {
      system: 'Du bist ein professioneller Übersetzer. Übersetze den Text des Nutzers nach ' + dest + '. '
        + 'Gib AUSSCHLIESSLICH die Übersetzung zurück — ohne Anführungszeichen, ohne Erklärungen, ohne Zusätze. '
        + 'Erhalte Ton, Absätze und Formatierung. Erkenne die Ausgangssprache automatisch.',
      prompt: text,
      temperature: 0.2,
    };
  }

  /* Führt die Übersetzung über das Gateway aus (Stream bevorzugt, sonst einmalig). */
  async function translate(text, target, onDelta) {
    const ai = window.Quantum.ai;
    if (!ai || !ai.hasAccess || !ai.hasAccess()) {
      throw Object.assign(new Error('kein KI-Zugang'), { local: true });
    }
    const req = buildRequest(text, target);
    if (ai.askStream) {
      try { return await ai.askStream({ ...req, maxTokens: 2000, onDelta: onDelta }); }
      catch (_) { return await ai.ask({ ...req, maxTokens: 2000 }); }
    }
    return await ai.ask({ ...req, maxTokens: 2000 });
  }

  /* Für Tests. */
  window.Quantum.translator = { parseTarget: parseTarget, buildRequest: buildRequest, LANGS: LANGS };

  /* ── Chat-Skill ────────────────────────────────────────────────── */

  function openTranslator() {
    if (typeof document === 'undefined') return;
    const tab = document.querySelector('[data-overview-tab="uebersetzer"]');
    if (tab) tab.click();
    const el = document.querySelector('#translate-input');
    if (el) window.setTimeout(() => el.focus(), 0);
  }

  if (window.Quantum.skills) {
    window.Quantum.skills.register({
      id: 'uebersetzer', icon: '🌍', name: 'Übersetzer',
      desc: 'Übersetzt Text in eine beliebige Sprache (KI)',
      usage: '/skill uebersetzer en: Hallo Welt',
      run(input) {
        const parsed = parseTarget(input);
        if (!parsed.text) { openTranslator(); return '🌍 **ÜBERSETZER** geöffnet. Tippe z. B. `/skill uebersetzer en: Hallo Welt` oder nutze den Tab in der Übersicht.'; }
        return translate(parsed.text, parsed.target)
          .then((r) => '🌍 **Übersetzung**' + (parsed.target ? ' (→ ' + parsed.target + ')' : '') + '\n\n' + r.text)
          .catch((e) => e.local
            ? 'ℹ️ Kein KI-Zugang aktiv — mit 🔑 oben rechts schaltest du die Übersetzung frei.'
            : '⚠️ Übersetzung fehlgeschlagen: ' + (e.message || 'nicht erreichbar'));
      },
    });
  }

  /* ── Übersicht-Tab-Panel ───────────────────────────────────────── */

  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-overview-panel="uebersetzer"]');
  if (!root) return;

  const $ = (sel) => root.querySelector(sel);
  const inputEl = $('#translate-input');
  const targetEl = $('#translate-target');
  const outEl = $('#translate-output');
  const btn = $('#translate-run');
  const copyBtn = $('#translate-copy');
  const statusEl = $('#translate-status');

  function setStatus(text, error) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('tool__status--error', Boolean(error));
  }

  async function run() {
    const text = (inputEl.value || '').trim();
    if (!text) { setStatus('Bitte gib erst einen Text ein.', true); return; }
    const target = targetEl.value; // '' = automatisch
    btn.disabled = true;
    if (copyBtn) copyBtn.disabled = true;
    outEl.value = '';
    setStatus('Übersetze …');
    try {
      const r = await translate(text, target, (partial) => { outEl.value = partial; });
      outEl.value = r.text;
      if (copyBtn) copyBtn.disabled = false;
      setStatus('✓ Fertig' + (r.model ? ' (' + r.model + ')' : ''));
    } catch (e) {
      setStatus(e.local
        ? 'ℹ️ Kein KI-Zugang aktiv — 🔑 oben rechts schaltet die Übersetzung frei.'
        : '⚠️ ' + (e.message || 'Übersetzung fehlgeschlagen.'), true);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', run);
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (!outEl.value) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(outEl.value).then(() => setStatus('In die Zwischenablage kopiert.'));
      } else {
        outEl.select(); document.execCommand('copy'); setStatus('In die Zwischenablage kopiert.');
      }
    });
  }
})();
