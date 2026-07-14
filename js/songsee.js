/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Songsee Beat-Visualizer (browser edition)
   Lädt eine Audiodatei (bleibt lokal), spielt sie ab und zeichnet
   dazu eine animierte Neon-Visualisierung, die auf den Beat reagiert.
   Export als .webm inkl. Ton (Canvas-Videospur + Audiospur via
   MediaRecorder). Reine Funktionen (Farb-Mapping, Beat-Detektor,
   Bass-Energie) liegen unter window.Quantum.songsee und sind testbar.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  /* ── Reine Funktionen (kein DOM/Audio) ─────────────────────────── */

  const palettes = {
    classic: [[3, 1, 18], [68, 15, 128], [0, 245, 255], [255, 255, 255]],
    magma: [[0, 0, 4], [85, 15, 109], [249, 114, 92], [252, 253, 191]],
    inferno: [[0, 0, 4], [87, 15, 109], [220, 75, 56], [252, 255, 164]],
    viridis: [[68, 1, 84], [49, 104, 142], [53, 183, 121], [253, 231, 37]],
    neon: [[5, 3, 20], [38, 247, 255], [180, 60, 255], [255, 59, 129]],
  };

  /* Farbe an Position value (0..1) entlang einer Palette. Reine Funktion. */
  function colorAt(paletteName, value) {
    const stops = palettes[paletteName] || palettes.classic;
    const scaled = Math.max(0, Math.min(0.999, value)) * (stops.length - 1);
    const index = Math.floor(scaled);
    const mix = scaled - index;
    return stops[index].map((channel, i) => Math.round(channel + (stops[index + 1][i] - channel) * mix));
  }

  /* Einfache Bass-Energie aus den unteren Frequenz-Bins (0..1). Reine Funktion. */
  function bassEnergy(freqData) {
    if (!freqData || !freqData.length) return 0;
    const n = Math.max(1, Math.floor(freqData.length / 8));
    let sum = 0;
    for (let i = 0; i < n; i++) sum += freqData[i];
    return sum / n / 255;
  }

  /* Beat-Detektor als Faktory mit gleitendem Durchschnitt (EMA).
     step(energy) → { beat, intensity }. Ein Beat gilt, wenn die aktuelle
     Energie den Schnitt deutlich (threshold) übersteigt. Deterministisch. */
  function createBeatDetector(opts) {
    opts = opts || {};
    const smoothing = opts.smoothing == null ? 0.9 : opts.smoothing;
    const threshold = opts.threshold == null ? 1.4 : opts.threshold;
    const floor = opts.floor == null ? 0.01 : opts.floor;
    let avg = 0;
    let primed = false;
    return function step(energy) {
      if (!primed) { avg = energy; primed = true; return { beat: false, intensity: 1 }; }
      const ratio = avg > 1e-6 ? energy / avg : 0;
      const beat = energy > floor && ratio > threshold;
      avg = avg * smoothing + energy * (1 - smoothing);
      return { beat: beat, intensity: ratio };
    };
  }

  window.Quantum.songsee = {
    palettes: palettes,
    colorAt: colorAt,
    bassEnergy: bassEnergy,
    createBeatDetector: createBeatDetector,
  };

  /* ── Chat-Skill (braucht nur Quantum.skills) ───────────────────── */

  function openSongsee() {
    if (typeof document === 'undefined') return;
    const tab = document.querySelector('[data-overview-tab="songsee"]');
    if (tab) tab.click();
    const el = document.querySelector('#songsee-file');
    if (el) window.setTimeout(() => el.focus(), 0);
  }

  if (window.Quantum.skills) {
    window.Quantum.skills.register({
      id: 'songsee', icon: '🌊', name: 'Songsee',
      desc: 'Audio-reaktiver Neon-Visualizer zum Beat (mit .webm-Export)',
      usage: '/skill songsee',
      run() {
        openSongsee();
        return '🌊 **Songsee ist geöffnet.** Wähle rechts eine Audiodatei, drück ▶ und sieh die Neon-Visualisierung zum Beat — die Datei bleibt lokal in deinem Browser. Mit ⏺ nimmst du sie als Video (.webm) auf.';
      },
    });
  }

  /* ── DOM/Audio-Teil ────────────────────────────────────────────── */

  if (typeof document === 'undefined') return;
  const canvas = document.querySelector('#songsee-canvas');
  if (!canvas) return;

  const $ = (selector) => document.querySelector(selector);
  const ctx = canvas.getContext('2d');
  const fileInput = $('#songsee-file');
  const playBtn = $('#songsee-play');
  const recBtn = $('#songsee-record');
  const status = $('#songsee-status');
  const styleSelect = $('#songsee-style');
  const visualSelect = $('#songsee-visual');

  const W = canvas.width;
  const H = canvas.height;

  let audioEl = null;
  let audioCtx = null;
  let analyser = null;
  let srcNode = null;
  let recDest = null;
  let freqData = null;
  let objectUrl = null;
  let fileName = 'audio';
  let rafId = null;
  const detector = createBeatDetector();
  let pulse = 0;
  let recorder = null;
  let recording = false;
  let chunks = [];

  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('songsee__status--error', Boolean(error));
  }

  function palette() { return styleSelect ? styleSelect.value : 'classic'; }
  function visual() { return visualSelect ? visualSelect.value : 'ringe'; }

  /* ── Zeichnen ──────────────────────────────────────────────────── */

  function fade(alpha) { ctx.fillStyle = 'rgba(3,0,16,' + alpha + ')'; ctx.fillRect(0, 0, W, H); }
  function css(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  function drawBars(freq, p, pal) {
    fade(0.28);
    const bins = 64;
    const step = Math.max(1, Math.floor(freq.length / bins));
    const bw = W / bins;
    for (let i = 0; i < bins; i++) {
      let v = 0;
      for (let j = 0; j < step; j++) v += freq[i * step + j] || 0;
      v = v / step / 255;
      const h = v * H * 0.92 * (1 + p * 0.3);
      ctx.fillStyle = css(colorAt(pal, i / bins));
      ctx.shadowBlur = 12 + p * 22; ctx.shadowColor = ctx.fillStyle;
      ctx.fillRect(i * bw + 1, H - h, bw - 2, h);
    }
    ctx.shadowBlur = 0;
  }

  function drawRings(freq, p, pal) {
    fade(0.22);
    const bins = 96;
    const step = Math.max(1, Math.floor(freq.length / bins));
    const baseR = Math.min(W, H) * 0.16 * (1 + p * 0.45);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    for (let i = 0; i < bins; i++) {
      let v = 0;
      for (let j = 0; j < step; j++) v += freq[i * step + j] || 0;
      v = v / step / 255;
      const ang = (i / bins) * Math.PI * 2;
      const len = baseR + v * Math.min(W, H) * 0.42;
      ctx.strokeStyle = css(colorAt(pal, v));
      ctx.lineWidth = 2.4; ctx.shadowBlur = 10 + p * 18; ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * baseR, Math.sin(ang) * baseR);
      ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  let particles = null;
  function drawParticles(freq, p, pal) {
    fade(0.2);
    if (!particles) {
      particles = [];
      for (let i = 0; i < 90; i++) particles.push({ a: Math.random() * Math.PI * 2, r: Math.random() });
    }
    const energy = bassEnergy(freq);
    const cx = W / 2, cy = H / 2;
    particles.forEach((pt) => {
      const bin = Math.floor(pt.r * (freq.length - 1));
      const v = (freq[bin] || 0) / 255;
      const rad = (0.1 + pt.r * 0.5) * Math.min(W, H) * (1 + p * 0.5) + v * 46;
      const x = cx + Math.cos(pt.a + energy * 0.6) * rad;
      const y = cy + Math.sin(pt.a + energy * 0.6) * rad;
      const size = 1 + v * 4 + p * 3;
      ctx.fillStyle = css(colorAt(pal, v));
      ctx.shadowBlur = 8 + p * 16; ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  function frame() {
    analyser.getByteFrequencyData(freqData);
    const b = detector(bassEnergy(freqData));
    if (b.beat) pulse = 1;
    pulse *= 0.9;
    const style = visual();
    const pal = palette();
    if (style === 'balken') drawBars(freqData, pulse, pal);
    else if (style === 'partikel') drawParticles(freqData, pulse, pal);
    else drawRings(freqData, pulse, pal);
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() { if (rafId == null) rafId = requestAnimationFrame(frame); }
  function stopLoop() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

  /* ── Audio laden ───────────────────────────────────────────────── */

  function teardown() {
    stopLoop();
    if (recorder && recording) { try { recorder.stop(); } catch (_) { /* egal */ } }
    recording = false;
    if (audioEl) { try { audioEl.pause(); } catch (_) { /* egal */ } }
    if (audioCtx) { try { audioCtx.close(); } catch (_) { /* egal */ } }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    audioEl = null; audioCtx = null; analyser = null; srcNode = null; recDest = null;
    if (playBtn) playBtn.textContent = '▶';
    if (recBtn) recBtn.textContent = '⏺ .WEBM';
  }

  async function loadAudio(file) {
    teardown();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Dein Browser unterstützt die Audio-Analyse nicht.');
    objectUrl = URL.createObjectURL(file);
    audioEl = new Audio();
    audioEl.src = objectUrl;
    audioCtx = new AC();
    srcNode = audioCtx.createMediaElementSource(audioEl);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    recDest = audioCtx.createMediaStreamDestination();
    srcNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    srcNode.connect(recDest);
    audioEl.addEventListener('ended', () => {
      stopLoop();
      if (playBtn) playBtn.textContent = '▶';
      if (recording) stopRecording();
    });
    fileName = file.name.replace(/\.[^.]+$/, '') || 'audio';
    fade(1);
    setStatus(file.name + ' geladen — ▶ Play drücken');
  }

  /* ── Wiedergabe / Aufnahme ─────────────────────────────────────── */

  async function togglePlay() {
    if (!audioEl) { setStatus('Bitte zuerst eine Audiodatei wählen.', true); return; }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    if (audioEl.paused) { await audioEl.play(); startLoop(); playBtn.textContent = '⏸'; setStatus('Läuft …'); }
    else { audioEl.pause(); playBtn.textContent = '▶'; setStatus('Pausiert'); }
  }

  function pickMime() {
    if (!window.MediaRecorder) return '';
    const list = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (let i = 0; i < list.length; i++) {
      try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (_) { /* weiter */ }
    }
    return '';
  }

  function dl(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 60000);
  }

  function stopRecording() {
    if (recorder && recording) { try { recorder.stop(); } catch (_) { /* egal */ } }
    recording = false;
    if (recBtn) recBtn.textContent = '⏺ .WEBM';
  }

  async function toggleRecord() {
    if (recording) { stopRecording(); return; }
    if (!audioEl) { setStatus('Bitte zuerst eine Audiodatei wählen.', true); return; }
    const mime = pickMime();
    if (!mime) { setStatus('Video-Aufnahme wird von diesem Browser nicht unterstützt.', true); return; }
    const canvasStream = canvas.captureStream(30);
    const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...recDest.stream.getAudioTracks()]);
    recorder = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 6000000 });
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
      dl(new Blob(chunks, { type: mime.split(';')[0] }), fileName + '-visualizer.' + ext);
      setStatus('🎬 Aufnahme gespeichert.');
    };
    audioEl.currentTime = 0;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    await audioEl.play();
    startLoop();
    playBtn.textContent = '⏸';
    recorder.start();
    recording = true;
    recBtn.textContent = '⏹ STOP';
    setStatus('● Aufnahme läuft … spielt bis zum Ende (oder ⏹ Stop)');
  }

  /* ── Verdrahtung ───────────────────────────────────────────────── */

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadAudio(fileInput.files[0]).catch((error) => setStatus(error.message, true));
  });
  if (playBtn) playBtn.addEventListener('click', () => togglePlay().catch((e) => setStatus(e.message, true)));
  if (recBtn) recBtn.addEventListener('click', () => toggleRecord().catch((e) => setStatus(e.message, true)));

  fade(1);
})();
