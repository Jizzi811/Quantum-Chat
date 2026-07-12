/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Live-Agenten (echte, schlüsselfreie APIs)
   hackernews: Hacker-News-Analyse (Algolia HN API)
   research:   Recherche-Crew (Wikipedia API)
   wetter:     Wetter-Bot (Open-Meteo)
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  function get(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    return fetch(url, { signal: ctrl.signal }).then((r) => {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  const OFFLINE = '⚠️ Die API ist gerade nicht erreichbar (Netzwerk/Firewall). Versuch es später nochmal.';

  /* ── Hacker-News-Analyse ───────────────────────────────────── */

  const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'for', 'and', 'with', 'on', 'is', 'how', 'why', 'your', 'from', 'at', 'by', 'new', 'via', 'what', 'are', 'you', 'show', 'ask', 'hn']);

  function hnTrends(hits) {
    const counts = {};
    hits.forEach((h) => (h.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach((w) => {
      if (w.length > 2 && !STOPWORDS.has(w)) counts[w] = (counts[w] || 0) + 1;
    }));
    return Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  }

  window.Quantum.skills.register({
    id: 'hackernews', icon: '📰', name: 'HackerNews-Analyst',
    desc: 'Analysiert die aktuelle HN-Frontpage',
    usage: '/skill hackernews',
    run() {
      return get('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=8')
        .then((data) => {
          const hits = data.hits || [];
          if (!hits.length) return 'Keine Stories gefunden.';
          const list = hits.map((h, i) =>
            (i + 1) + '. **' + h.title + '** — ▲' + (h.points || 0) + ' · 💬' + (h.num_comments || 0) +
            '\n   ' + (h.url || 'https://news.ycombinator.com/item?id=' + h.objectID)
          ).join('\n');
          const trends = hnTrends(hits);
          return '📰 **HACKER NEWS — FRONTPAGE-ANALYSE**\n\n' + list +
            (trends.length ? '\n\n🔥 Trend-Begriffe gerade: ' + trends.join(', ') : '');
        })
        .catch(() => OFFLINE);
    },
  });

  /* ── Recherche-Crew (Wikipedia) ────────────────────────────── */

  const WIKI = 'https://de.wikipedia.org/w/api.php?format=json&origin=*&action=query';

  window.Quantum.skills.register({
    id: 'research', icon: '🔎', name: 'Recherche-Crew',
    desc: 'Recherchiert ein Thema (Wikipedia)',
    usage: '/skill research Quantencomputer',
    run(input) {
      const topic = input.trim();
      if (!topic) return 'Welches Thema? Beispiel: `/skill research Quantencomputer`';
      return get(WIKI + '&list=search&srlimit=4&srsearch=' + encodeURIComponent(topic))
        .then((data) => {
          const hits = (data.query || {}).search || [];
          if (!hits.length) return 'Nichts gefunden zu „' + topic + '“ — anderes Stichwort probieren?';
          const top = hits[0].title;
          return get(WIKI + '&prop=extracts&exintro=1&explaintext=1&titles=' + encodeURIComponent(top))
            .then((d2) => {
              const pages = (d2.query || {}).pages || {};
              const page = pages[Object.keys(pages)[0]] || {};
              let extract = (page.extract || '').trim();
              if (extract.length > 600) extract = extract.slice(0, 600).replace(/\s+\S*$/, '') + ' …';
              const more = hits.slice(1).map((h) => '· ' + h.title).join('\n');
              return '🔎 **RECHERCHE-CREW — ERGEBNIS**\n\n📚 **' + top + '**\n' + (extract || '(kein Auszug verfügbar)') +
                '\n\n🔗 https://de.wikipedia.org/wiki/' + encodeURIComponent(top.replace(/ /g, '_')) +
                (more ? '\n\nWeitere Spuren:\n' + more : '');
            });
        })
        .catch(() => OFFLINE);
    },
  });

  /* ── Wetter-Bot (Open-Meteo) ───────────────────────────────── */

  const WMO = {
    0: '☀️ klar', 1: '🌤 überwiegend klar', 2: '⛅ teils bewölkt', 3: '☁️ bedeckt',
    45: '🌫 Nebel', 48: '🌫 Reifnebel', 51: '🌦 leichter Niesel', 53: '🌦 Niesel', 55: '🌧 starker Niesel',
    61: '🌧 leichter Regen', 63: '🌧 Regen', 65: '🌧 starker Regen', 71: '🌨 leichter Schnee',
    73: '🌨 Schnee', 75: '❄️ starker Schnee', 80: '🌦 Schauer', 81: '🌧 Schauer', 82: '⛈ heftige Schauer',
    95: '⛈ Gewitter', 96: '⛈ Gewitter mit Hagel', 99: '⛈ schweres Gewitter',
  };

  function wmoText(code) { return WMO[code] || '🌡 Code ' + code; }

  window.Quantum.skills.register({
    id: 'wetter', icon: '🌦', name: 'Wetter-Bot',
    desc: 'Aktuelles Wetter + 3-Tage-Trend',
    usage: '/skill wetter Berlin',
    run(input) {
      const city = input.trim() || 'Berlin';
      return get('https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name=' + encodeURIComponent(city))
        .then((geo) => {
          const loc = (geo.results || [])[0];
          if (!loc) return 'Ort „' + city + '“ nicht gefunden.';
          const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude + '&longitude=' + loc.longitude +
            '&current_weather=true&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3';
          return get(url).then((wx) => {
            const cur = wx.current_weather || {};
            const d = wx.daily || {};
            const days = (d.time || []).map((t, i) =>
              '· ' + new Date(t + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short' }) + ' ' +
              wmoText((d.weather_code || [])[i]) + ' — ' + Math.round((d.temperature_2m_min || [])[i]) + '° bis ' +
              Math.round((d.temperature_2m_max || [])[i]) + '°, Regen ' + ((d.precipitation_probability_max || [])[i] ?? '?') + ' %'
            ).join('\n');
            return '🌦 **WETTER — ' + loc.name.toUpperCase() + (loc.country ? ', ' + loc.country : '') + '**\n\n' +
              'Jetzt: ' + wmoText(cur.weathercode) + ', **' + Math.round(cur.temperature) + '°C**, Wind ' + Math.round(cur.windspeed) + ' km/h\n\n' + days;
          });
        })
        .catch(() => OFFLINE);
    },
  });
})();
