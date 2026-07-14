/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Faktenchecker
   Prüft eine Behauptung gegen echte Belege: Wikipedia (de, keyless)
   liefert die Faktenbasis, das Gateway-Modell fällt das Urteil
   AUSSCHLIESSLICH auf Basis dieser Belege. Als Chat-Skill
   (/skill faktencheck) und als Übersicht-Tab.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const WIKI = 'https://de.wikipedia.org/w/api.php?format=json&origin=*&action=query';
  const OFFLINE = '⚠️ Wikipedia ist gerade nicht erreichbar (Netzwerk/Firewall). Versuch es später nochmal.';
  const DISCLAIMER = '_Hinweis: KI-Urteil auf Basis von Wikipedia — gut für enzyklopädische Aussagen, '
    + 'schwach bei tagesaktuellen Ereignissen. Quellen selbst prüfen._';

  const STOPWORDS = new Set([
    'der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'einer', 'und', 'oder', 'aber', 'ist', 'sind',
    'war', 'waren', 'wird', 'werden', 'hat', 'haben', 'hatte', 'im', 'in', 'am', 'an', 'auf', 'aus', 'bei',
    'mit', 'von', 'vom', 'zu', 'zum', 'zur', 'für', 'als', 'auch', 'nicht', 'kein', 'keine', 'nur', 'sehr',
    'dass', 'weil', 'wenn', 'man', 'sich', 'es', 'sie', 'er', 'wir', 'ihr', 'den', 'dem', 'des', 'so', 'um',
  ]);

  function get(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    return fetch(url, { signal: ctrl.signal }).then((r) => {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* Zieht Suchbegriffe aus einer Behauptung (Stoppwörter/kurze Wörter raus).
     Fällt auf die Roh-Behauptung zurück, wenn nichts übrig bleibt. Reine Funktion. */
  function keywords(claim) {
    const words = String(claim || '')
      .replace(/[^0-9A-Za-zÄÖÜäöüß\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));
    const seen = new Set();
    const uniq = [];
    words.forEach((w) => { const k = w.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(w); } });
    return uniq.slice(0, 6).join(' ') || String(claim || '').trim();
  }

  /* Baut den KI-Request: Urteil nur auf Basis der Belege, festes Format. Reine Funktion. */
  function buildRequest(claim, evidence) {
    const belege = evidence.map((e) => '- [' + e.title + '] ' + e.extract).join('\n\n');
    return {
      system: 'Du bist ein sorgfältiger Faktenprüfer. Beurteile die Behauptung AUSSCHLIESSLICH auf Basis der '
        + 'bereitgestellten Belege aus Wikipedia. Erfinde nichts, was nicht in den Belegen steht. Reichen die '
        + 'Belege nicht aus, wähle UNKLAR. Antworte in genau diesem Format:\n'
        + 'URTEIL: <STIMMT | STIMMT NICHT | UNKLAR>\nBEGRÜNDUNG: <ein bis zwei Sätze auf Deutsch>',
      prompt: 'Behauptung: "' + claim + '"\n\nBelege:\n' + belege,
      temperature: 0.1,
    };
  }

  /* Liest URTEIL/BEGRÜNDUNG aus der Modell-Antwort. Reine Funktion. */
  function parseVerdict(text) {
    const raw = String(text || '');
    const vMatch = raw.match(/URTEIL:\s*(.+)/i);
    const rMatch = raw.match(/BEGR[ÜU]NDUNG:\s*([\s\S]+)/i);
    const label = (vMatch ? vMatch[1] : '').trim().toUpperCase();
    let emoji = '⚠️';
    let verdict = 'Teilweise / Unklar';
    if (/STIMMT\s*NICHT|FALSCH|UNWAHR/.test(label)) { emoji = '❌'; verdict = 'Stimmt nicht'; }
    else if (/^(STIMMT|WAHR|KORREKT|RICHTIG)/.test(label)) { emoji = '✅'; verdict = 'Stimmt'; }
    const reasoning = (rMatch ? rMatch[1] : raw).trim();
    return { emoji: emoji, verdict: verdict, reasoning: reasoning };
  }

  function sourceLines(sources) {
    return sources.map((s) => '· [' + s.title + '](' + s.url + ')').join('\n');
  }

  /* Endgültige Ausgabe mit Urteil. Reine Funktion. */
  function formatResult(claim, parsed, sources) {
    return '🔍 **FAKTENCHECK**\n> „' + claim + '“\n\n'
      + parsed.emoji + ' **' + parsed.verdict + '**\n' + parsed.reasoning + '\n\n'
      + '📚 Quellen:\n' + sourceLines(sources) + '\n\n' + DISCLAIMER;
  }

  /* Ausgabe ohne KI: nur die gefundenen Belege. Reine Funktion. */
  function formatEvidenceOnly(claim, evidence, sources) {
    const belege = evidence.map((e) => '📚 **' + e.title + '**\n' + e.extract).join('\n\n');
    return '🔍 **FAKTENCHECK** (Belege ohne automatisches Urteil)\n> „' + claim + '“\n\n'
      + (belege || '(keine Auszüge verfügbar)') + '\n\n'
      + 'ℹ️ Für ein automatisches Urteil (✅/❌/⚠️) 🔑 oben rechts den KI-Zugang aktivieren.\n\n'
      + '📎 Quellen:\n' + sourceLines(sources);
  }

  function wikiTitleUrl(title) {
    return 'https://de.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
  }

  /* Kompletter Ablauf: Belege holen → Urteil. Liefert einen Markdown-String. */
  async function check(claim) {
    const query = keywords(claim);
    const searchData = await get(WIKI + '&list=search&srlimit=3&srsearch=' + encodeURIComponent(query));
    const hits = (searchData.query || {}).search || [];
    if (!hits.length) {
      return '🔍 **FAKTENCHECK**\n> „' + claim + '“\n\n⚠️ Keine belastbare Wikipedia-Quelle zu dieser Aussage '
        + 'gefunden. Formuliere die Behauptung ggf. mit klareren Stichwörtern.';
    }
    const top = hits.slice(0, 2);
    const extractData = await get(WIKI + '&prop=extracts&exintro=1&explaintext=1&titles='
      + encodeURIComponent(top.map((h) => h.title).join('|')));
    const pages = (extractData.query || {}).pages || {};
    const evidence = Object.keys(pages).map((k) => pages[k])
      .map((p) => ({ title: p.title, extract: (p.extract || '').trim().slice(0, 700) }))
      .filter((e) => e.extract);
    const sources = top.map((h) => ({ title: h.title, url: wikiTitleUrl(h.title) }));

    if (!evidence.length) {
      return '🔍 **FAKTENCHECK**\n> „' + claim + '“\n\n⚠️ Quelle gefunden, aber ohne verwertbaren Textauszug.\n\n'
        + '📎 Quellen:\n' + sourceLines(sources);
    }

    const ai = window.Quantum.ai;
    if (!ai || !ai.hasAccess || !ai.hasAccess()) {
      return formatEvidenceOnly(claim, evidence, sources);
    }
    const req = buildRequest(claim, evidence);
    let result;
    try {
      if (ai.askStream) {
        try { result = await ai.askStream({ ...req, maxTokens: 700 }); }
        catch (_) { result = await ai.ask({ ...req, maxTokens: 700 }); }
      } else {
        result = await ai.ask({ ...req, maxTokens: 700 });
      }
    } catch (e) {
      return formatEvidenceOnly(claim, evidence, sources) + '\n\n⚠️ KI-Urteil nicht möglich: ' + (e.message || 'Fehler');
    }
    return formatResult(claim, parseVerdict(result.text), sources);
  }

  /* Für Tests. */
  window.Quantum.factcheck = {
    keywords: keywords,
    buildRequest: buildRequest,
    parseVerdict: parseVerdict,
    formatResult: formatResult,
    formatEvidenceOnly: formatEvidenceOnly,
  };

  /* ── Chat-Skill ────────────────────────────────────────────────── */

  function openFactcheck() {
    if (typeof document === 'undefined') return;
    const tab = document.querySelector('[data-overview-tab="factcheck"]');
    if (tab) tab.click();
    const el = document.querySelector('#factcheck-input');
    if (el) window.setTimeout(() => el.focus(), 0);
  }

  if (window.Quantum.skills) {
    window.Quantum.skills.register({
      id: 'faktencheck', icon: '🔍', name: 'Faktenchecker',
      desc: 'Prüft eine Behauptung gegen Wikipedia-Belege (KI-Urteil)',
      usage: '/skill faktencheck Die Mauer fiel 1989',
      run(input) {
        const claim = String(input || '').trim();
        if (!claim) { openFactcheck(); return '🔍 **FAKTENCHECKER** geöffnet. Gib eine Behauptung ein, z. B. `/skill faktencheck Die Mauer fiel 1989`.'; }
        return check(claim).catch(() => OFFLINE);
      },
    });
  }

  /* ── Übersicht-Tab-Panel ───────────────────────────────────────── */

  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-overview-panel="factcheck"]');
  if (!root) return;

  const $ = (sel) => root.querySelector(sel);
  const inputEl = $('#factcheck-input');
  const btn = $('#factcheck-run');
  const outEl = $('#factcheck-output');
  const statusEl = $('#factcheck-status');

  function setStatus(text, error) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('tool__status--error', Boolean(error));
  }

  async function run() {
    const claim = (inputEl.value || '').trim();
    if (!claim) { setStatus('Bitte gib erst eine Behauptung ein.', true); return; }
    btn.disabled = true;
    outEl.textContent = '';
    setStatus('Prüfe gegen Wikipedia …');
    try {
      outEl.textContent = await check(claim);
      setStatus('✓ Fertig');
    } catch (e) {
      setStatus('⚠️ ' + (e.message || 'Faktencheck fehlgeschlagen.'), true);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', run);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); });
})();
