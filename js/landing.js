/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Landing / Aurora Hero
   Interaktiver Aurora-Gradient: Blobs auf Parallax-Ebenen mit
   Feder-Easing zum Cursor, Proximity-„Pop“ (heller/größer nahe am
   Cursor), Bloom, das nach Bewegung weich ausblendet, Cursor-Licht.
   requestAnimationFrame + translate3d für 60 FPS; auf Mobilgeräten
   und bei prefers-reduced-motion reduziert.
   Außerdem: Access-Token-Eingabe für das KI-Gateway (Groq/NVIDIA/OpenRouter).
   ═══════════════════════════════════════════════════════════════ */
window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const landing = document.getElementById('landing');
  if (!landing) return;

  const layers = [
    document.getElementById('aurora-layer-1'),
    document.getElementById('aurora-layer-2'),
    document.getElementById('aurora-layer-3'),
  ];
  const light = document.getElementById('aurora-light');
  const bloom = document.getElementById('aurora-bloom');
  const heroStage = document.getElementById('hero-core-stage');
  const heroCore = document.getElementById('hero-core');

  const coarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Blob-Definitionen: Position in %, Größe in vmax, Ebene = Parallax-Tiefe.
     Farben: Violett, Blau, Cyan, Pink, Smaragd. */
  const BLOBS = [
    { color: '#9d4dff', size: 58, x: 22, y: 30, speed: 0.00010, phase: 0.0, opacity: 0.50, layer: 0 },
    { color: '#4d6bff', size: 52, x: 74, y: 24, speed: 0.00013, phase: 1.7, opacity: 0.42, layer: 0 },
    { color: '#00f5ff', size: 44, x: 60, y: 72, speed: 0.00016, phase: 3.1, opacity: 0.36, layer: 1 },
    { color: '#ff2df7', size: 46, x: 30, y: 74, speed: 0.00012, phase: 4.4, opacity: 0.34, layer: 1 },
    { color: '#2dffa8', size: 38, x: 84, y: 62, speed: 0.00018, phase: 5.6, opacity: 0.30, layer: 2 },
    { color: '#7b2dff', size: 34, x: 12, y: 56, speed: 0.00021, phase: 2.3, opacity: 0.32, layer: 2 },
    { color: '#00c8ff', size: 30, x: 48, y: 14, speed: 0.00024, phase: 0.9, opacity: 0.28, layer: 2 },
  ];
  const activeBlobs = coarse ? BLOBS.slice(0, 4) : BLOBS;

  const blobEls = activeBlobs.map((blob) => {
    const el = document.createElement('div');
    el.className = 'aurora__blob';
    el.style.width = blob.size + 'vmax';
    el.style.height = blob.size + 'vmax';
    el.style.background = 'radial-gradient(circle, ' + blob.color + ' 0%, transparent 65%)';
    el.style.opacity = String(blob.opacity);
    (layers[blob.layer] || layers[0]).appendChild(el);
    return el;
  });

  /* Feder-Easing: Cursorziel wird nicht direkt gesetzt, sondern über
     eine gedämpfte Feder verfolgt — „magnetisch“, nie ruckartig. */
  const spring = {
    x: window.innerWidth / 2, y: window.innerHeight / 2,
    vx: 0, vy: 0,
    tx: window.innerWidth / 2, ty: window.innerHeight / 2,
  };
  let bloomEnergy = 0;
  let lastPointerMove = 0;
  let rafId = null;

  window.addEventListener('pointermove', (e) => {
    spring.tx = e.clientX;
    spring.ty = e.clientY;
    lastPointerMove = performance.now();
  }, { passive: true });

  function frame(now) {
    /* Feder-Integration */
    const stiffness = 0.055;
    const damping = 0.86;
    spring.vx = (spring.vx + (spring.tx - spring.x) * stiffness) * damping;
    spring.vy = (spring.vy + (spring.ty - spring.y) * stiffness) * damping;
    spring.x += spring.vx;
    spring.y += spring.vy;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const nx = spring.x / w - 0.5;     /* -0.5 … 0.5 */
    const ny = spring.y / h - 0.5;

    /* Parallax: Ebenen bewegen sich unterschiedlich stark zum Cursor */
    const depths = [14, 30, 52];
    layers.forEach((layer, i) => {
      if (layer) layer.style.transform = 'translate3d(' + (-nx * depths[i]) + 'px,' + (-ny * depths[i]) + 'px,0)';
    });

    /* Blobs: langsames Schweben + Proximity-Pop nahe am Cursor */
    const sigma = Math.min(w, h) * 0.28;
    activeBlobs.forEach((blob, i) => {
      const floatX = Math.sin(now * blob.speed + blob.phase) * 6;      /* in % */
      const floatY = Math.cos(now * blob.speed * 0.8 + blob.phase) * 5;
      const px = (blob.x + floatX) / 100 * w;
      const py = (blob.y + floatY) / 100 * h;
      let scale = 1;
      let opacity = blob.opacity;
      if (!coarse) {
        const dx = px - spring.x;
        const dy = py - spring.y;
        const proximity = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        scale = 1 + proximity * 0.32;                    /* expandiert */
        opacity = Math.min(0.85, blob.opacity + proximity * 0.30); /* leuchtet auf */
      }
      blobEls[i].style.transform =
        'translate3d(' + px + 'px,' + py + 'px,0) translate(-50%,-50%) scale(' + scale.toFixed(3) + ')';
      blobEls[i].style.opacity = opacity.toFixed(3);
    });

    /* Cursor-Licht folgt der Feder direkt */
    if (light) light.style.transform = 'translate3d(' + spring.x + 'px,' + spring.y + 'px,0) translate(-50%,-50%)';

    /* Bloom: Energie steigt mit Bewegung, klingt danach weich ab */
    if (bloom && !coarse) {
      const speed = Math.hypot(spring.vx, spring.vy);
      const idleFor = now - lastPointerMove;
      const target = idleFor < 900 ? Math.min(1, speed / 14 + 0.35) : 0;
      bloomEnergy += (target - bloomEnergy) * 0.06;
      bloom.style.opacity = bloomEnergy.toFixed(3);
      bloom.style.transform = 'translate3d(' + spring.x + 'px,' + spring.y + 'px,0) translate(-50%,-50%) scale(' + (0.9 + bloomEnergy * 0.25).toFixed(3) + ')';
    }

    /* Hero-Core: neigt sich weich zum Cursor und sammelt bei Bewegung
       Licht (leichtes Aufskalieren); die Wellenstärke folgt der Energie. */
    if (heroStage && !coarse) {
      const maxTilt = 15;
      const scale = 1 + bloomEnergy * 0.04;
      heroStage.style.transform =
        'rotateX(' + (ny * maxTilt).toFixed(2) + 'deg) rotateY(' + (-nx * maxTilt).toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
    }
    if (heroCore) heroCore.style.setProperty('--wave-strength', (0.18 + bloomEnergy * 0.6).toFixed(3));

    rafId = requestAnimationFrame(frame);
  }

  function startAurora() {
    if (reducedMotion || rafId !== null) return;
    rafId = requestAnimationFrame(frame);
  }

  function stopAurora() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  /* ── Access-Token & Öffnen/Schließen ─────────────────────────── */

  const form = document.getElementById('landing-form');
  const tokenInput = document.getElementById('landing-token');
  const hint = document.getElementById('landing-hint');

  function refreshHint() {
    const active = !!(window.Quantum.ai && window.Quantum.ai.hasAccess && window.Quantum.ai.hasAccess());
    if (active) {
      hint.textContent = '🟢 KI-Zugang aktiv — Chatfragen beantwortet das konfigurierte KI-Modell (z. B. Groq/Llama).';
      hint.classList.add('landing__hint--ok');
    } else {
      hint.textContent = 'Ohne Code startet Quantum im lokalen Demo-Modus (ohne Live-KI-Antworten).';
      hint.classList.remove('landing__hint--ok');
    }
  }

  function open() {
    landing.hidden = false;
    landing.classList.remove('landing--closing');
    refreshHint();
    startAurora();
    if (!coarse) tokenInput.focus();
  }

  function close() {
    landing.classList.add('landing--closing');
    setTimeout(() => {
      landing.hidden = true;
      stopAurora();
    }, 620);
    try { sessionStorage.setItem('quantum.landing.seen', '1'); } catch (_) { /* privater Modus */ }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const token = tokenInput.value.trim();
    if (token && window.Quantum.ai && window.Quantum.ai.setAccess) {
      window.Quantum.ai.setAccess(token);
      if (window.Quantum.ui) window.Quantum.ui.system('🔑 KI-Zugang gespeichert — Fragen im Chat gehen jetzt an das konfigurierte KI-Modell.');
    }
    tokenInput.value = '';
    close();
  });

  const reopenBtn = document.getElementById('btn-ai-access');
  if (reopenBtn) reopenBtn.addEventListener('click', open);

  /* Beim ersten Besuch der Session zeigen, danach nur noch per 🔑 */
  let seen = false;
  try { seen = sessionStorage.getItem('quantum.landing.seen') === '1'; } catch (_) { /* egal */ }
  if (seen) {
    landing.hidden = true;
  } else {
    open();
  }
})();
