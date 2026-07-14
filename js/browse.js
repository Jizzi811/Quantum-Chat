/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Web-Reader-Skill „browse"
   Lädt eine Webseite über die Netlify-Function /browse, füttert den
   Text ins KI-Gateway (z. B. Hermes) und lässt das Modell sie
   zusammenfassen oder eine Frage dazu beantworten.
     /skill browse https://example.com
     /skill browse https://example.com | Worum geht es? Was kostet es?
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const endpoint = '/.netlify/functions/browse';

  function accessToken() {
    try { return sessionStorage.getItem('quantum.ai.access') || ''; } catch (_) { return ''; }
  }

  /* Trennt URL und optionale Frage (per „|"). Ergänzt fehlendes https://.
     Reine Funktion. */
  function parseBrowseInput(input) {
    const raw = String(input || '').trim();
    if (!raw) return { url: '', question: '' };
    const sep = raw.indexOf('|');
    let urlPart = (sep > -1 ? raw.slice(0, sep) : raw).trim();
    const question = sep > -1 ? raw.slice(sep + 1).trim() : '';
    /* Ersten URL-artigen Token nehmen, falls davor/dahinter Text steht. */
    const token = urlPart.match(/\S+/);
    urlPart = token ? token[0] : '';
    if (urlPart && !/^https?:\/\//i.test(urlPart)) urlPart = 'https://' + urlPart;
    return { url: urlPart, question };
  }

  async function fetchPage(url) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify({ url }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* unten behandelt */ }
    if (!res.ok || !data.text) {
      throw new Error(data.error || ('Web-Reader-Fehler (HTTP ' + res.status + ').'));
    }
    return data;
  }

  window.Quantum.browse = { parseBrowseInput, endpoint };

  window.Quantum.skills.register({
    id: 'browse', icon: '🌐', name: 'Web-Reader',
    desc: 'Liest eine Webseite und beantwortet Fragen dazu',
    usage: '/skill browse https://example.com | Worum geht es?',
    async run(input) {
      const { url, question } = parseBrowseInput(input);
      if (!url) return '🌐 **WEB-READER** — gib eine Adresse an, z. B. `/skill browse https://example.com | Worum geht es?`';
      if (!accessToken()) return '🌐 Kein KI-Zugangscode gesetzt — oben rechts über 🔑 eingeben, dann funktioniert der Web-Reader.';

      let page;
      try {
        page = await fetchPage(url);
      } catch (error) {
        return '🌐 Seite konnte nicht gelesen werden: ' + (error.message || 'unbekannter Fehler');
      }

      const source = '🌐 **' + (page.title || page.url) + '**\n' + page.url
        + (page.truncated ? '\n_(Seite gekürzt — nur der Anfang wurde gelesen.)_' : '');

      const ai = window.Quantum.ai;
      if (!ai || !ai.hasAccess || !ai.hasAccess()) {
        /* Ohne KI zumindest den Rohtext liefern. */
        return source + '\n\n' + page.text.slice(0, 2000) + (page.text.length > 2000 ? ' …' : '');
      }

      const task = question || 'Fasse den Inhalt dieser Seite in klaren Stichpunkten zusammen.';
      const request = {
        system: 'Du bist ein präziser Web-Lese-Assistent. Beantworte die Aufgabe AUSSCHLIESSLICH anhand des'
          + ' bereitgestellten Seiteninhalts. Erfinde nichts dazu; wenn die Antwort nicht im Text steht, sage das.'
          + ' Antworte auf Deutsch, kompakt und gut strukturiert.',
        prompt: 'Seite: ' + page.url + '\nTitel: ' + (page.title || '(kein Titel)')
          + '\n\nSEITENINHALT:\n"""\n' + page.text + '\n"""\n\nAUFGABE: ' + task,
        temperature: 0.3,
      };

      try {
        const result = ai.askStream
          ? await ai.askStream({ ...request, maxTokens: 2000 })
          : await ai.ask({ ...request, maxTokens: 1500 });
        return source + '\n\n' + (result.text || '').trim();
      } catch (error) {
        return source + '\n\n⚠️ KI-Antwort fehlgeschlagen: ' + (error.message || 'nicht erreichbar')
          + '\n\n' + page.text.slice(0, 1500) + (page.text.length > 1500 ? ' …' : '');
      }
    },
  });
})();
