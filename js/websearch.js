/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Websuche-Skill „websuche"
   Sucht über die Netlify-Function /search (Tavily) passende Seiten
   und lässt das KI-Gateway (z. B. Hermes) daraus eine Antwort mit
   Quellenangaben bauen.
     /skill websuche Wann ist der nächste SpaceX-Start?
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const endpoint = '/.netlify/functions/search';

  function accessToken() {
    try { return sessionStorage.getItem('quantum.ai.access') || ''; } catch (_) { return ''; }
  }

  /* Baut die nummerierte Quellenliste für Prompt und Anzeige. Reine Funktion. */
  function formatSources(results) {
    return (results || []).map((r, i) => '[' + (i + 1) + '] ' + (r.title || r.url) + '\n' + r.url).join('\n');
  }

  async function search(query) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify({ query }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* unten */ }
    if (!res.ok) throw new Error(data.error || ('Websuche-Fehler (HTTP ' + res.status + ').'));
    return data;
  }

  window.Quantum.webSearch = { formatSources, endpoint };

  window.Quantum.skills.register({
    id: 'websuche', icon: '🔎', name: 'Websuche',
    desc: 'Sucht im Web und beantwortet mit Quellen (Tavily)',
    usage: '/skill websuche Wann startet die nächste SpaceX-Mission?',
    async run(input) {
      const query = String(input || '').trim();
      if (!query) return '🔎 **WEBSUCHE** — stell eine Frage, z. B. `/skill websuche Neueste KI-Modelle 2026`.';
      if (!accessToken()) return '🔎 Kein KI-Zugangscode gesetzt — oben rechts über 🔑 eingeben.';

      let data;
      try {
        data = await search(query);
      } catch (error) {
        return '🔎 Suche fehlgeschlagen: ' + (error.message || 'unbekannter Fehler');
      }

      const results = data.results || [];
      const sources = formatSources(results);
      if (!results.length) {
        return '🔎 Keine Treffer' + (data.answer ? '\n\n' + data.answer : '.');
      }

      const ai = window.Quantum.ai;
      if (!ai || !ai.hasAccess || !ai.hasAccess()) {
        /* Ohne KI: Tavily-Kurzantwort + Quellen. */
        return '🔎 **WEBSUCHE: ' + query + '**\n\n' + (data.answer ? data.answer + '\n\n' : '') + '**Quellen:**\n' + sources;
      }

      const context = results.map((r, i) => '[' + (i + 1) + '] ' + (r.title || r.url) + '\nURL: ' + r.url + '\n' + r.content).join('\n\n');
      const request = {
        system: 'Du bist ein präziser Recherche-Assistent. Beantworte die Frage AUSSCHLIESSLICH anhand der'
          + ' Suchergebnisse. Zitiere die genutzten Quellen im Text als [1], [2] usw. Wenn die Ergebnisse die'
          + ' Frage nicht abdecken, sage das ehrlich. Antworte auf Deutsch, kompakt und klar.',
        prompt: 'Frage: ' + query + '\n\nSUCHERGEBNISSE:\n"""\n' + context + '\n"""\n\nBeantworte die Frage mit Quellenangaben.',
        temperature: 0.3,
      };

      try {
        const result = ai.askStream
          ? await ai.askStream({ ...request, maxTokens: 1800 })
          : await ai.ask({ ...request, maxTokens: 1500 });
        return '🔎 **WEBSUCHE: ' + query + '**\n\n' + (result.text || '').trim() + '\n\n**Quellen:**\n' + sources;
      } catch (error) {
        return '🔎 **WEBSUCHE: ' + query + '**\n\n' + (data.answer ? data.answer + '\n\n' : '')
          + '⚠️ KI-Zusammenfassung fehlgeschlagen: ' + (error.message || 'nicht erreichbar') + '\n\n**Quellen:**\n' + sources;
      }
    },
  });
})();
