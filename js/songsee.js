/* QUANTUM — Songsee audio visualizer (browser edition) */
(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#songsee-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const fileInput = $('#songsee-file');
  const renderButton = $('#songsee-render');
  const downloadButton = $('#songsee-download');
  const status = $('#songsee-status');
  const styleSelect = $('#songsee-style');
  const startInput = $('#songsee-start');
  const durationInput = $('#songsee-duration');
  let decodedAudio = null;
  let fileName = 'audio';

  function openSongsee() {
    const tab = $('[data-overview-tab="songsee"]');
    if (tab) tab.click();
    window.setTimeout(() => fileInput.focus(), 0);
  }

  if (window.Quantum && window.Quantum.skills) {
    window.Quantum.skills.register({
      id: 'songsee', icon: '🌊', name: 'Songsee',
      desc: 'Erzeugt Spektrogramme aus Audiodateien',
      usage: '/skill songsee',
      run() {
        openSongsee();
        return '🌊 **Songsee ist geöffnet.** Wähle rechts eine Audiodatei aus und erzeuge dein Spektrogramm — die Datei bleibt lokal in deinem Browser.';
      },
    });
  }

  const palettes = {
    classic: [[3, 1, 18], [68, 15, 128], [0, 245, 255], [255, 255, 255]],
    magma: [[0, 0, 4], [85, 15, 109], [249, 114, 92], [252, 253, 191]],
    inferno: [[0, 0, 4], [87, 15, 109], [220, 75, 56], [252, 255, 164]],
    viridis: [[68, 1, 84], [49, 104, 142], [53, 183, 121], [253, 231, 37]],
    gray: [[0, 0, 0], [70, 70, 70], [175, 175, 175], [255, 255, 255]],
  };

  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('songsee__status--error', Boolean(error));
  }

  function colorAt(value) {
    const stops = palettes[styleSelect.value] || palettes.classic;
    const scaled = Math.max(0, Math.min(0.999, value)) * (stops.length - 1);
    const index = Math.floor(scaled);
    const mix = scaled - index;
    return stops[index].map((channel, i) => Math.round(channel + (stops[index + 1][i] - channel) * mix));
  }

  async function loadAudio(file) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Dein Browser unterstützt die Audio-Analyse nicht.');
    const audioContext = new AudioContext();
    try {
      decodedAudio = await audioContext.decodeAudioData(await file.arrayBuffer());
    } finally {
      await audioContext.close();
    }
    fileName = file.name.replace(/\.[^.]+$/, '') || 'audio';
    durationInput.placeholder = decodedAudio.duration.toFixed(1);
    setStatus(file.name + ' geladen · ' + decodedAudio.duration.toFixed(1) + ' Sekunden');
  }

  function fftMagnitudes(samples, offset, fftSize) {
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const sample = samples[offset + i] || 0;
      real[i] = sample * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }
    const bits = Math.log2(fftSize);
    for (let source = 0; source < fftSize; source++) {
      let reversed = 0;
      for (let b = 0; b < bits; b++) reversed = (reversed << 1) | ((source >> b) & 1);
      if (source < reversed) {
        [real[source], real[reversed]] = [real[reversed], real[source]];
        [imag[source], imag[reversed]] = [imag[reversed], imag[source]];
      }
    }
    for (let size = 2; size <= fftSize; size <<= 1) {
      const half = size >> 1;
      const angle = -2 * Math.PI / size;
      for (let start = 0; start < fftSize; start += size) {
        for (let j = 0; j < half; j++) {
          const cos = Math.cos(angle * j);
          const sin = Math.sin(angle * j);
          const even = start + j;
          const odd = even + half;
          const tr = real[odd] * cos - imag[odd] * sin;
          const ti = real[odd] * sin + imag[odd] * cos;
          real[odd] = real[even] - tr;
          imag[odd] = imag[even] - ti;
          real[even] += tr;
          imag[even] += ti;
        }
      }
    }
    const magnitudes = new Float32Array(fftSize / 2);
    for (let i = 0; i < magnitudes.length; i++) magnitudes[i] = Math.hypot(real[i], imag[i]);
    return magnitudes;
  }

  function renderSpectrogram() {
    if (!decodedAudio) return setStatus('Bitte zuerst eine Audiodatei auswählen.', true);
    setStatus('Spektrogramm wird berechnet …');
    renderButton.disabled = true;
    requestAnimationFrame(() => {
      try {
        const samples = decodedAudio.getChannelData(0);
        const startSeconds = Math.max(0, Number(startInput.value) || 0);
        const available = Math.max(0, decodedAudio.duration - startSeconds);
        const duration = Math.min(Number(durationInput.value) || available, available);
        if (!duration) throw new Error('Der gewählte Ausschnitt liegt außerhalb der Audiodatei.');
        const startSample = Math.floor(startSeconds * decodedAudio.sampleRate);
        const endSample = Math.min(samples.length, startSample + Math.floor(duration * decodedAudio.sampleRate));
        const width = canvas.width;
        const height = canvas.height;
        const fftSize = 1024;
        const image = ctx.createImageData(width, height);
        for (let x = 0; x < width; x++) {
          const offset = Math.min(endSample - fftSize, startSample + Math.floor((x / width) * (endSample - startSample - fftSize)));
          const magnitudes = fftMagnitudes(samples, Math.max(0, offset), fftSize);
          for (let y = 0; y < height; y++) {
            const curved = Math.pow(1 - y / height, 2.2);
            const bin = Math.min(magnitudes.length - 1, Math.floor(curved * magnitudes.length));
            const power = Math.max(0, Math.min(1, (20 * Math.log10(magnitudes[bin] + 1e-7) + 75) / 75));
            const color = colorAt(power);
            const pixel = (y * width + x) * 4;
            image.data[pixel] = color[0];
            image.data[pixel + 1] = color[1];
            image.data[pixel + 2] = color[2];
            image.data[pixel + 3] = 255;
          }
        }
        ctx.putImageData(image, 0, 0);
        ctx.fillStyle = 'rgba(2, 0, 16, .72)';
        ctx.fillRect(0, 0, width, 32);
        ctx.fillStyle = '#eafcff';
        ctx.font = '600 14px JetBrains Mono, monospace';
        ctx.fillText(fileName + ' · ' + startSeconds.toFixed(1) + '–' + (startSeconds + duration).toFixed(1) + ' s', 14, 21);
        downloadButton.disabled = false;
        setStatus('Fertig · ' + width + ' × ' + height + ' px');
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        renderButton.disabled = false;
      }
    });
  }

  document.querySelectorAll('[data-overview-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.overviewTab;
      document.querySelectorAll('[data-overview-tab]').forEach((item) => item.classList.toggle('is-active', item === button));
      document.querySelectorAll('[data-overview-tab]').forEach((item) => item.setAttribute('aria-selected', String(item === button)));
      document.querySelectorAll('[data-overview-panel]').forEach((panel) => { panel.hidden = panel.dataset.overviewPanel !== target; });
    });
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadAudio(fileInput.files[0]).catch((error) => setStatus(error.message, true));
  });
  renderButton.addEventListener('click', renderSpectrogram);
  downloadButton.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = fileName + '-spectrogram.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
})();
