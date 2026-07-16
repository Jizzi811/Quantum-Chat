/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Echte Video-Generierung „video-real"
   Schickt einen Prompt über die Netlify-Function /video-real an
   LongCat-Video (fal.ai), pollt den Queue-Status und liefert die
   fertige Video-URL. Für lange Renders: /skill video-status <id>.
     /skill video-real Ein Fuchs läuft durch einen Neonwald
   ⚠️ Kostenpflichtig (~$0.04/Sek.), benötigt FAL_KEY in Netlify.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const endpoint = '/.netlify/functions/video-real';
  const POLL_INTERVAL_MS = 5000;
  const MAX_POLLS = 24; // ~2 Min inline, danach Übergabe an /skill video-status

  function accessToken() {
    try { return sessionStorage.getItem('quantum.ai.access') || ''; } catch (_) { return ''; }
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function call(payload) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* unten */ }
    if (!res.ok) throw new Error(data.error || ('Video-Fehler (HTTP ' + res.status + ').'));
    return data;
  }

  /* Endnachricht mit Video-Link. Reine Funktion. */
  function formatReady(url) {
    return '🎬 **Video fertig!**\n\n[▶ Ansehen / herunterladen](' + url + ')\n\n'
      + '_Erzeugt mit LongCat-Video über fal.ai (~$0.04/Sek.)._';
  }
  /* Hinweis bei noch laufendem Render. Reine Funktion. */
  function formatPending(id) {
    return '🎬 Dein Video wird noch gerendert (bei LongCat oft 1–3 Min).\n\n'
      + 'Auftrags-ID: `' + id + '`\n\nStand prüfen mit: `/skill video-status ' + id + '`';
  }

  window.Quantum.videoReal = { endpoint, formatReady, formatPending };

  window.Quantum.skills.register({
    id: 'video-real', icon: '🎥', name: 'Echtes Video (LongCat)',
    desc: 'Generiert ein echtes KI-Video via LongCat-Video/fal.ai (kostet ~$0.04/Sek.)',
    usage: '/skill video-real Ein Fuchs läuft durch einen Neonwald',
    async run(input) {
      const prompt = String(input || '').trim();
      if (!prompt) {
        return '🎥 **ECHTES VIDEO (LongCat)** — beschreibe die Szene, z. B. '
          + '`/skill video-real Ein Fuchs läuft durch einen Neonwald`.\n\n'
          + '⚠️ Kostenpflichtig (~$0.04/Sek.), benötigt einen `FAL_KEY` in Netlify.';
      }
      if (!accessToken()) return '🎥 Kein KI-Zugangscode gesetzt — oben rechts über 🔑 eingeben.';

      let submit;
      try { submit = await call({ action: 'submit', prompt: prompt }); }
      catch (e) { return '🎥 Start fehlgeschlagen: ' + (e.message || 'unbekannt'); }
      const id = submit.request_id;
      if (!id) return '🎥 fal lieferte keine Auftrags-ID.';

      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL_MS);
        let st;
        try { st = await call({ action: 'status', request_id: id }); }
        catch (e) {
          return '🎥 Statusprüfung fehlgeschlagen: ' + (e.message || 'unbekannt')
            + '\n\nAuftrags-ID: `' + id + '` — später mit `/skill video-status ' + id + '` prüfen.';
        }
        if (st.status === 'COMPLETED' && st.video_url) return formatReady(st.video_url);
      }
      return formatPending(id);
    },
  });

  window.Quantum.skills.register({
    id: 'video-status', icon: '⏳', name: 'Video-Status',
    desc: 'Prüft ein laufendes LongCat-Video und zeigt den Link, wenn fertig',
    usage: '/skill video-status <auftrags-id>',
    async run(input) {
      const id = String(input || '').trim();
      if (!id) return '⏳ Gib die Auftrags-ID an: `/skill video-status <id>`.';
      if (!accessToken()) return '⏳ Kein KI-Zugangscode gesetzt — oben rechts über 🔑 eingeben.';
      let st;
      try { st = await call({ action: 'status', request_id: id }); }
      catch (e) { return '⏳ Prüfung fehlgeschlagen: ' + (e.message || 'unbekannt'); }
      if (st.status === 'COMPLETED' && st.video_url) return formatReady(st.video_url);
      return '⏳ Status: **' + (st.status || 'unbekannt') + '** — noch nicht fertig. '
        + 'Gleich nochmal `/skill video-status ' + id + '` probieren.';
    },
  });
})();
