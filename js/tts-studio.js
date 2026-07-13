/* ═══════════════════════════════════════════════════════════════
   QUANTUM — VoxCPM TTS Studio
   Sprachsynthese mit VoxCPM (github.com/OpenBMB/VoxCPM). Das Modell
   selbst ist Python + GPU und kann nicht auf Netlify laufen — das
   Studio ruft deshalb die Gradio-API eines VoxCPM-Servers direkt aus
   dem Browser auf (Standard: der offizielle Hugging-Face-Space
   OpenBMB/VoxCPM-Demo, alternativ ein eigener Server via
   `python app.py --port 8808`). Fallback: Web Speech API.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const DEFAULT_SERVER = 'https://openbmb-voxcpm-demo.hf.space';
  const CFG_KEY = 'quantum.tts.config';
  /* ZeroGPU-Spaces stellen Anfragen in eine Warteschlange — großzügiges
     Zeitlimit, damit auch ein kalter Start durchläuft. */
  const GENERATE_TIMEOUT_MS = 180000;

  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (_) { /* privat/voll */ }
  }

  /* "openbmb-voxcpm-demo.hf.space/" → "https://openbmb-voxcpm-demo.hf.space" */
  function normalizeServer(raw) {
    let url = String(raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url.replace(/\/+$/, '');
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
  }

  /* Argumente in der Reihenfolge der _generate-Signatur des VoxCPM-Demos:
     (text, control_instruction, ref_wav, use_prompt_text, prompt_text,
      cfg_value, do_normalize, denoise, dit_steps, seed) */
  function buildPayload({ text, instruction, cfg, steps, seed }) {
    return {
      data: [
        String(text || ''),
        String(instruction || ''),
        null,
        false,
        '',
        clamp(cfg, 1.0, 3.0, 2.0),
        false,
        false,
        Math.round(clamp(steps, 1, 50, 10)),
        Number.isFinite(Number(seed)) && Number(seed) >= 0
          ? Math.floor(Number(seed))
          : Math.floor(Math.random() * 4294967296),
      ],
    };
  }

  /* Minimaler SSE-Parser für Gradios /gradio_api/call/<fn>/<event_id>-Stream:
     Blöcke sind durch Leerzeilen getrennt, relevant sind event: + data:. */
  function parseSseEvents(text) {
    const events = [];
    for (const block of String(text).split(/\r?\n\r?\n/)) {
      let event = 'message';
      const data = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      if (data.length) events.push({ event, data: data.join('\n') });
    }
    return events;
  }

  /* Gradio liefert Audio als FileData ({url, path}); je nach Version fehlt
     url — dann aus path + Server-Basis eine Download-URL bauen. */
  function audioUrlFrom(fileData, base) {
    if (!fileData || typeof fileData !== 'object') return null;
    if (fileData.url) return fileData.url;
    if (fileData.path) return base + '/gradio_api/file=' + fileData.path;
    return null;
  }

  function currentServer() {
    return normalizeServer(loadConfig().server) || DEFAULT_SERVER;
  }

  async function generate({ text, instruction, cfg, steps, seed, onStatus }) {
    const config = loadConfig();
    const base = currentServer();
    const status = typeof onStatus === 'function' ? onStatus : () => {};
    const headers = { 'Content-Type': 'application/json' };
    if (config.token) headers.Authorization = 'Bearer ' + config.token;
    const signal = AbortSignal.timeout(GENERATE_TIMEOUT_MS);

    status('Anfrage an VoxCPM-Server wird gestellt …');
    const started = await fetch(base + '/gradio_api/call/generate', {
      method: 'POST', headers, signal,
      body: JSON.stringify(buildPayload({ text, instruction, cfg, steps, seed })),
    });
    if (!started.ok) {
      throw new Error('VoxCPM-Server antwortete mit HTTP ' + started.status
        + (started.status === 401 || started.status === 403 ? ' — prüfe deinen Hugging-Face-Token (`/skill tts token hf_…`).' : '.'));
    }
    const startedBody = await started.json();
    const eventId = startedBody && startedBody.event_id;
    if (!eventId) throw new Error('VoxCPM-Server lieferte keine event_id — ist unter ' + base + ' wirklich ein Gradio-Server erreichbar?');

    status('In der Warteschlange — VoxCPM generiert (kann beim Kaltstart 1–2 Minuten dauern) …');
    const stream = await fetch(base + '/gradio_api/call/generate/' + eventId, {
      signal,
      headers: config.token ? { Authorization: 'Bearer ' + config.token } : {},
    });
    if (!stream.ok) throw new Error('Ergebnis-Stream fehlgeschlagen (HTTP ' + stream.status + ').');

    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      /* Nur vollständige Blöcke auswerten, den Rest im Puffer lassen */
      const cut = buffer.lastIndexOf('\n\n');
      const ready = cut >= 0 ? buffer.slice(0, cut + 2) : '';
      buffer = cut >= 0 ? buffer.slice(cut + 2) : buffer;
      for (const evt of parseSseEvents(ready)) {
        if (evt.event === 'error') {
          let message = evt.data;
          try { message = JSON.parse(evt.data) || evt.data; } catch (_) { /* Klartext */ }
          throw new Error('VoxCPM meldet: ' + (typeof message === 'string' ? message : JSON.stringify(message))
            + ' — bei Quota-Fehlern hilft ein (kostenloser) Hugging-Face-Token: `/skill tts token hf_…`');
        }
        if (evt.event === 'complete') {
          let payload = null;
          try { payload = JSON.parse(evt.data); } catch (_) { /* unten behandelt */ }
          const url = Array.isArray(payload) ? audioUrlFrom(payload[0], base) : null;
          if (!url) throw new Error('VoxCPM lieferte kein Audio zurück.');
          return { url, seed: Array.isArray(payload) ? payload[1] : undefined, server: base };
        }
      }
      if (done) break;
    }
    throw new Error('Der VoxCPM-Stream endete ohne Ergebnis — bitte erneut versuchen.');
  }

  /* ── Studio-Panel (Modal) ──────────────────────────────────── */

  let modal = null;

  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function buildModal() {
    modal = el('div', 'tts-studio');
    modal.setAttribute('data-testid', 'tts-studio');
    modal.innerHTML =
      '<div class="tts-studio__card">' +
      '  <div class="tts-studio__head">' +
      '    <span class="tts-studio__title">🔊 VOXCPM TTS STUDIO</span>' +
      '    <button class="tts-studio__close" data-testid="tts-close" title="Schließen">✕</button>' +
      '  </div>' +
      '  <label class="tts-studio__label" for="tts-text">Text</label>' +
      '  <textarea id="tts-text" class="tts-studio__text" data-testid="tts-text" rows="4" maxlength="2000" placeholder="Was soll VoxCPM sagen?"></textarea>' +
      '  <label class="tts-studio__label" for="tts-voice">Stimm-Design (optional, z. B. „junge Frau, ruhig, leicht heiser“)</label>' +
      '  <input id="tts-voice" class="tts-studio__input" data-testid="tts-voice" maxlength="300" placeholder="Beschreibung der Wunschstimme …" />' +
      '  <details class="tts-studio__advanced"><summary>⚙ Server &amp; Qualität</summary>' +
      '    <label class="tts-studio__label" for="tts-server">VoxCPM-Server (Gradio)</label>' +
      '    <input id="tts-server" class="tts-studio__input" data-testid="tts-server" placeholder="' + DEFAULT_SERVER + '" />' +
      '    <label class="tts-studio__label" for="tts-token">Hugging-Face-Token (optional, für mehr GPU-Quota)</label>' +
      '    <input id="tts-token" class="tts-studio__input" type="password" data-testid="tts-token" placeholder="hf_…" />' +
      '    <div class="tts-studio__row">' +
      '      <label class="tts-studio__label">CFG <input id="tts-cfg" class="tts-studio__num" type="number" min="1" max="3" step="0.1" value="2.0" /></label>' +
      '      <label class="tts-studio__label">Steps <input id="tts-steps" class="tts-studio__num" type="number" min="1" max="50" step="1" value="10" /></label>' +
      '    </div>' +
      '  </details>' +
      '  <div class="tts-studio__actions">' +
      '    <button class="tts-studio__generate" data-testid="tts-generate">⚡ SPRACHE GENERIEREN</button>' +
      '    <button class="tts-studio__fallback" data-testid="tts-fallback" title="Web Speech API deines Browsers">🗣 Browser-Stimme</button>' +
      '  </div>' +
      '  <div class="tts-studio__status" data-testid="tts-status" aria-live="polite"></div>' +
      '  <div class="tts-studio__result" hidden>' +
      '    <audio class="tts-studio__audio" data-testid="tts-audio" controls></audio>' +
      '    <a class="tts-studio__download" data-testid="tts-download" download="voxcpm-quantum.wav">⬇ WAV speichern</a>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);

    const $ = (sel) => modal.querySelector(sel);
    const statusEl = $('.tts-studio__status');
    const resultEl = $('.tts-studio__result');
    const audioEl = $('.tts-studio__audio');
    const downloadEl = $('.tts-studio__download');
    const generateBtn = $('.tts-studio__generate');

    const config = loadConfig();
    if (config.server) $('#tts-server').value = config.server;
    if (config.token) $('#tts-token').value = config.token;

    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.className = 'tts-studio__status' + (kind ? ' tts-studio__status--' + kind : '');
    }

    $('.tts-studio__close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    $('.tts-studio__fallback').addEventListener('click', () => {
      const text = $('#tts-text').value.trim();
      if (!text) { setStatus('Bitte erst einen Text eingeben.', 'error'); return; }
      if (!('speechSynthesis' in window)) { setStatus('Dein Browser unterstützt keine Sprachausgabe.', 'error'); return; }
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 1000));
      utterance.lang = 'de-DE';
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
      setStatus('Browser-Stimme spricht (Web Speech API, nicht VoxCPM).', 'ok');
    });

    generateBtn.addEventListener('click', async () => {
      const text = $('#tts-text').value.trim();
      if (!text) { setStatus('Bitte erst einen Text eingeben.', 'error'); return; }

      /* Server/Token aus dem Formular übernehmen und merken */
      const nextConfig = loadConfig();
      nextConfig.server = normalizeServer($('#tts-server').value);
      nextConfig.token = $('#tts-token').value.trim();
      saveConfig(nextConfig);

      generateBtn.disabled = true;
      resultEl.hidden = true;
      try {
        const result = await generate({
          text,
          instruction: $('#tts-voice').value.trim(),
          cfg: $('#tts-cfg').value,
          steps: $('#tts-steps').value,
          onStatus: (msg) => setStatus(msg),
        });
        setStatus('Audio wird geladen …');
        /* Als Blob laden, damit Player + Download zuverlässig funktionieren;
           falls CORS das Blob verweigert, direkt auf die URL zeigen. */
        let src = result.url;
        try {
          const audio = await fetch(result.url, { signal: AbortSignal.timeout(60000) });
          if (audio.ok) src = URL.createObjectURL(await audio.blob());
        } catch (_) { /* direkte URL als Notnagel */ }
        audioEl.src = src;
        downloadEl.href = src;
        resultEl.hidden = false;
        setStatus('✓ Fertig — generiert von ' + result.server, 'ok');
        audioEl.play().catch(() => { /* Autoplay ggf. blockiert */ });
      } catch (error) {
        const aborted = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        setStatus(aborted
          ? 'Zeitlimit erreicht — der VoxCPM-Server hat nicht geantwortet. Tipp: 🗣 Browser-Stimme als Fallback.'
          : '⚠ ' + (error.message || 'VoxCPM ist nicht erreichbar.') + ' Tipp: 🗣 Browser-Stimme als Fallback.', 'error');
      } finally {
        generateBtn.disabled = false;
      }
    });

    return modal;
  }

  function open(text) {
    if (!modal) buildModal();
    modal.hidden = false;
    const field = modal.querySelector('#tts-text');
    if (text) field.value = text;
    field.focus();
    if (text) modal.querySelector('.tts-studio__generate').click();
  }

  function close() {
    if (modal) modal.hidden = true;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /* ── Skill ─────────────────────────────────────────────────── */

  window.Quantum.ttsStudio = { DEFAULT_SERVER, normalizeServer, buildPayload, parseSseEvents, audioUrlFrom, currentServer, generate, open, close };

  window.Quantum.skills.register({
    id: 'tts', icon: '🔊', name: 'VoxCPM TTS Studio',
    desc: 'Text zu Sprache mit VoxCPM — Studio mit Stimm-Design',
    usage: '/skill tts Hallo, ich bin Quantum!',
    run(input) {
      const raw = input.trim();

      const server = raw.match(/^server(?:\s+(.+))?$/i);
      if (server) {
        const config = loadConfig();
        config.server = normalizeServer(server[1]);
        saveConfig(config);
        return config.server
          ? '🔊 VoxCPM-Server gesetzt: `' + config.server + '`'
          : '🔊 VoxCPM-Server zurückgesetzt auf den offiziellen Demo-Space: `' + DEFAULT_SERVER + '`';
      }

      const token = raw.match(/^token(?:\s+(.+))?$/i);
      if (token) {
        const config = loadConfig();
        config.token = (token[1] || '').trim();
        saveConfig(config);
        return config.token
          ? '🔊 Hugging-Face-Token gespeichert (nur lokal in deinem Browser).'
          : '🔊 Hugging-Face-Token gelöscht.';
      }

      if (/^status$/i.test(raw)) {
        const config = loadConfig();
        return [
          '🔊 **VOXCPM TTS STUDIO**',
          '· Server: `' + currentServer() + '`' + (config.server ? '' : ' (offizieller Demo-Space)'),
          '· Hugging-Face-Token: ' + (config.token ? 'gesetzt' : 'keiner (anonyme GPU-Quota)'),
          '· Befehle: `/skill tts <Text>` · `/skill tts server <URL>` · `/skill tts token <hf_…>` · `/skill tts status`',
        ].join('\n');
      }

      open(raw);
      return raw
        ? '🔊 **VOXCPM TTS STUDIO** geöffnet — Sprachsynthese läuft. Das Modell rechnet extern auf ' +
          '`' + currentServer() + '` (Kaltstart kann 1–2 Minuten dauern).'
        : '🔊 **VOXCPM TTS STUDIO** geöffnet. Text eingeben, optional eine Wunschstimme beschreiben und ⚡ drücken. ' +
          '`/skill tts status` zeigt die Konfiguration.';
    },
  });
})();
