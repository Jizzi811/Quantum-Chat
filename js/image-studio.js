/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Bild-Studio
   Skill "bild": erzeugt Bilder aus Text über die Netlify-Function
   /image (Gemini Bildgenerierung via separatem GEMINI_IMAGE_API_KEY).
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const endpoint = '/.netlify/functions/image';
  const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

  function accessToken() {
    try { return sessionStorage.getItem('quantum.ai.access') || ''; } catch (_) { return ''; }
  }

  async function generate({ prompt, aspectRatio }) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify({ prompt, aspectRatio }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* unten */ }
    if (!res.ok || !data.image) {
      const err = new Error(data.error || ('Bilddienst-Fehler (HTTP ' + res.status + ').'));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ── Modal ─────────────────────────────────────────────────── */

  let modal = null;

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'tts-studio';
    modal.setAttribute('data-testid', 'image-studio');
    modal.innerHTML =
      '<div class="tts-studio__card">' +
      '  <div class="tts-studio__head">' +
      '    <span class="tts-studio__title">🎨 BILD-STUDIO</span>' +
      '    <button class="tts-studio__close" data-testid="image-close" title="Schließen">✕</button>' +
      '  </div>' +
      '  <label class="tts-studio__label" for="img-prompt">Bildbeschreibung</label>' +
      '  <textarea id="img-prompt" class="tts-studio__text" data-testid="image-prompt" rows="3" maxlength="4000" placeholder="z. B. „Neon-Cyberpunk-Stadt bei Regen, Vogelperspektive, cineastisch"></textarea>' +
      '  <label class="tts-studio__label" for="img-ratio">Seitenverhältnis</label>' +
      '  <select id="img-ratio" class="tts-studio__input" data-testid="image-ratio">' +
      RATIOS.map((r) => '<option value="' + r + '">' + r + '</option>').join('') +
      '  </select>' +
      '  <div class="tts-studio__actions">' +
      '    <button class="tts-studio__generate" data-testid="image-generate">⚡ BILD GENERIEREN</button>' +
      '  </div>' +
      '  <div class="tts-studio__status" data-testid="image-status" aria-live="polite"></div>' +
      '  <div class="tts-studio__result" hidden>' +
      '    <img class="image-studio__img" data-testid="image-result" alt="Generiertes Bild" style="width:100%;border-radius:12px;border:1px solid var(--border-soft)" />' +
      '    <a class="tts-studio__download" data-testid="image-download" download="quantum-bild.png">⬇ Bild speichern</a>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);

    const $ = (sel) => modal.querySelector(sel);
    const statusEl = $('.tts-studio__status');
    const resultEl = $('.tts-studio__result');
    const imgEl = $('.image-studio__img');
    const downloadEl = $('.tts-studio__download');
    const genBtn = $('.tts-studio__generate');

    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.className = 'tts-studio__status' + (kind ? ' tts-studio__status--' + kind : '');
    }

    $('.tts-studio__close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    genBtn.addEventListener('click', async () => {
      const prompt = $('#img-prompt').value.trim();
      if (!prompt) { setStatus('Bitte erst eine Bildbeschreibung eingeben.', 'error'); return; }
      if (!accessToken()) { setStatus('Kein KI-Zugangscode gesetzt — oben rechts über 🔑 eingeben.', 'error'); return; }
      genBtn.disabled = true;
      resultEl.hidden = true;
      setStatus('Bild wird generiert … (kann einige Sekunden dauern)');
      try {
        const result = await generate({ prompt, aspectRatio: $('#img-ratio').value });
        imgEl.src = result.image;
        downloadEl.href = result.image;
        resultEl.hidden = false;
        setStatus('✓ Fertig (' + (result.model || 'Gemini') + ')', 'ok');
      } catch (error) {
        setStatus('⚠ ' + (error.message || 'Bildgeneration fehlgeschlagen.'), 'error');
      } finally {
        genBtn.disabled = false;
      }
    });

    return modal;
  }

  function open(prompt) {
    if (!modal) buildModal();
    modal.hidden = false;
    const field = modal.querySelector('#img-prompt');
    if (prompt) field.value = prompt;
    field.focus();
    if (prompt) modal.querySelector('.tts-studio__generate').click();
  }

  function close() { if (modal) modal.hidden = true; }

  window.Quantum.imageStudio = { endpoint, generate, open, close };

  window.Quantum.skills.register({
    id: 'bild', icon: '🎨', name: 'Bild-Studio',
    desc: 'Erzeugt Bilder aus Text (Gemini)',
    usage: '/skill bild Neon-Cyberpunk-Stadt bei Regen',
    run(input) {
      open(input.trim());
      return input.trim()
        ? '🎨 **BILD-STUDIO** geöffnet — dein Bild wird generiert.'
        : '🎨 **BILD-STUDIO** geöffnet. Beschreibe dein Wunschbild, wähle das Seitenverhältnis und drück ⚡.';
    },
  });
})();
