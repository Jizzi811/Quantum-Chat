/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Der Core
   Lebendiges Marken-Herz der Landingpage: eine dunkle Kugel aus
   flüssigem Glas, in der violette/cyan/magentafarbene Lichtströme
   wie Gedankenbahnen kreisen. Der Core atmet, reagiert auf den
   Mauszeiger (Neigung, Lichtsammlung, Wellen in den Hintergrund),
   trägt transparente Energieringe mit sieben kreisenden Skill-
   Modulen und deutet alle paar Sekunden für einen Moment zwei
   Augen an. Beim Start öffnet er sich mit einem Licht-Burst.
   Reines Canvas-2D, keine Bibliotheken; respektiert
   prefers-reduced-motion (statisches Standbild).
   ═══════════════════════════════════════════════════════════════ */
window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const canvas = document.getElementById('quantum-core');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  /* Markenfarben: Violett, Cyan, etwas Magenta */
  const STREAM_COLORS = ['#9d4dff', '#00f5ff', '#ff2df7', '#4d6bff'];
  /* Die sieben Skill-Module auf den Energieringen */
  const MODULES = [
    { color: '#00f5ff' }, /* Code */
    { color: '#9d4dff' }, /* Sprache */
    { color: '#ff2df7' }, /* Bilder */
    { color: '#4d6bff' }, /* Recherche */
    { color: '#2dffa8' }, /* Automationen */
    { color: '#c9a8ff' }, /* Strategie */
    { color: '#4db8ff' }, /* Kreativität */
  ];
  /* Energieringe: Neigung (Stauchung), Drehung, Umlaufgeschwindigkeit */
  const RINGS = [
    { squash: 0.34, rot: -0.42, speed: 0.00016, radius: 1.42, alpha: 0.20 },
    { squash: 0.52, rot: 0.65, speed: -0.00011, radius: 1.60, alpha: 0.15 },
    { squash: 0.22, rot: 0.12, speed: 0.00008, radius: 1.78, alpha: 0.11 },
  ];

  /* Innere Lichtströme: Punkte auf pseudo-3D-Bahnen in der Kugel */
  const streams = Array.from({ length: coarse ? 60 : 96 }, (_, i) => ({
    theta: Math.random() * Math.PI * 2,
    phi: Math.random() * Math.PI * 2,
    speedT: (0.0002 + Math.random() * 0.0006) * (Math.random() < 0.5 ? -1 : 1),
    speedP: 0.0001 + Math.random() * 0.0004,
    depth: 0.25 + Math.random() * 0.7,        /* Bahnradius in der Kugel */
    size: 0.8 + Math.random() * 1.6,
    color: STREAM_COLORS[i % STREAM_COLORS.length],
  }));

  /* Feine Lichtpartikel im Raum um den Core (statt greller Neonflächen) */
  const dust = Array.from({ length: coarse ? 16 : 30 }, () => ({
    x: Math.random(), y: Math.random(),
    drift: 0.00002 + Math.random() * 0.00006,
    phase: Math.random() * Math.PI * 2,
    size: 0.4 + Math.random() * 1.1,
  }));

  let size = 0;
  let dpr = 1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };  /* geglättete Neigung -1…1 */
  let ripples = [];
  let lastRipple = 0;
  let burstStart = -1;
  let rafId = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = rect.width;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }

  /* Der Core reagiert auf den Zeiger im gesamten Landing-Bereich */
  const hero = document.getElementById('landing') || canvas;
  hero.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    pointer.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width * 0.9)));
    pointer.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height * 0.9)));
    /* Bewegung sendet feine Wellen in den Hintergrund (gedrosselt) */
    const now = performance.now();
    if (now - lastRipple > 750) {
      lastRipple = now;
      ripples.push({ start: now, life: 1600 });
      if (ripples.length > 4) ripples.shift();
    }
  }, { passive: true });

  function drawFrame(now) {
    if (!size) resize();
    const s = size;
    const c = s / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);

    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    /* Atmen: ruhiges Pulsieren wie ein Atemzug (~6 s Zyklus) */
    const breath = 1 + Math.sin(now * 0.001) * 0.018;
    /* Start-Burst: Core öffnet sich, Licht flutet nach außen */
    let burst = 0;
    if (burstStart >= 0) burst = Math.min(1, (now - burstStart) / 650);
    const R = s * 0.27 * breath * (1 + burst * 0.9);
    const tiltX = pointer.x * R * 0.16;
    const tiltY = pointer.y * R * 0.16;

    /* ── Lichtpartikel im Raum ── */
    ctx.globalCompositeOperation = 'lighter';
    dust.forEach((p) => {
      const px = (p.x + Math.sin(now * p.drift + p.phase) * 0.03) * s;
      const py = (p.y + Math.cos(now * p.drift * 0.8 + p.phase) * 0.03) * s;
      const tw = 0.25 + 0.2 * Math.sin(now * 0.0012 + p.phase * 3);
      ctx.fillStyle = 'rgba(180,200,255,' + tw.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    /* ── Wellen, die die Mausbewegung nach außen schickt ── */
    ripples = ripples.filter((r) => now - r.start < r.life);
    ripples.forEach((r) => {
      const t = (now - r.start) / r.life;
      const rr = R * (1.1 + t * 1.6);
      ctx.strokeStyle = 'rgba(157,77,255,' + (0.28 * (1 - t)).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(c + tiltX * 0.4, c + tiltY * 0.4, rr, 0, Math.PI * 2);
      ctx.stroke();
    });

    /* ── Energieringe + Module (hintere Hälften) ── */
    const ringPoints = RINGS.map((ring, ri) => {
      const pts = [];
      for (let i = 0; i <= 72; i += 1) {
        const a = (i / 72) * Math.PI * 2 + now * ring.speed * 1000 * 0.001;
        const x0 = Math.cos(a) * R * ring.radius;
        const y0 = Math.sin(a) * R * ring.radius * ring.squash;
        const rot = ring.rot + pointer.x * 0.06;
        pts.push({
          x: c + x0 * Math.cos(rot) - y0 * Math.sin(rot),
          y: c + x0 * Math.sin(rot) + y0 * Math.cos(rot) + pointer.y * 4,
          front: Math.sin(a) > 0,
          a,
          ri,
        });
      }
      return pts;
    });

    function strokeRing(pts, frontPass, alpha) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(160,140,255,' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      let pen = false;
      pts.forEach((p) => {
        if (p.front === frontPass) {
          if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
        } else pen = false;
      });
      ctx.stroke();
    }

    ringPoints.forEach((pts, ri) => strokeRing(pts, false, RINGS[ri].alpha * (1 + burst)));

    /* Module hinter der Kugel */
    function drawModules(frontPass) {
      MODULES.forEach((mod, mi) => {
        const ring = RINGS[mi % RINGS.length];
        const a = (mi / MODULES.length) * Math.PI * 2 + now * ring.speed * 1.6 + mi;
        const x0 = Math.cos(a) * R * ring.radius;
        const y0 = Math.sin(a) * R * ring.radius * ring.squash;
        const rot = ring.rot + pointer.x * 0.06;
        const x = c + x0 * Math.cos(rot) - y0 * Math.sin(rot);
        const y = c + x0 * Math.sin(rot) + y0 * Math.cos(rot) + pointer.y * 4;
        const front = Math.sin(a) > 0;
        if (front !== frontPass) return;
        const depthScale = front ? 1.05 : 0.75;
        ctx.shadowColor = mod.color;
        ctx.shadowBlur = front ? 10 : 5;
        ctx.fillStyle = mod.color;
        ctx.globalAlpha = front ? 0.95 : 0.45;
        ctx.beginPath();
        ctx.arc(x, y, 2.6 * depthScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      });
    }
    drawModules(false);

    /* ── Die Kugel: dunkles flüssiges Glas ── */
    ctx.globalCompositeOperation = 'source-over';
    const body = ctx.createRadialGradient(
      c - R * 0.35 + tiltX, c - R * 0.4 + tiltY, R * 0.1,
      c, c, R,
    );
    body.addColorStop(0, '#171132');
    body.addColorStop(0.55, '#0b0720');
    body.addColorStop(1, '#04020c');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fill();

    /* Innenleben nur innerhalb der Kugel zeichnen */
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    streams.forEach((p) => {
      p.theta += p.speedT * (1 + burst * 5);
      p.phi += p.speedP;
      /* Bahn in der Kugel, leicht zur Mausseite gezogen (Licht sammeln) */
      const r3 = R * p.depth;
      const x = Math.cos(p.theta) * r3;
      const y = Math.sin(p.theta) * Math.cos(p.phi) * r3 * 0.8;
      const z = Math.sin(p.theta) * Math.sin(p.phi);   /* -1…1 Tiefe */
      const px = c + x + tiltX * (1.6 + z);
      const py = c + y + tiltY * (1.6 + z);
      const glow = 0.35 + 0.35 * (z + 1) / 2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = glow;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, p.size * (0.7 + (z + 1) * 0.35), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    /* Angedeutete Augen: alle ~16 s für gut 2 s ein sanftes Gesicht */
    const eyeCycle = (now % 16000) / 16000;
    if (eyeCycle > 0.86) {
      const t = (eyeCycle - 0.86) / 0.14;
      const eyeAlpha = Math.sin(t * Math.PI) * 0.5;
      [-1, 1].forEach((side) => {
        const ex = c + side * R * 0.3 + tiltX * 1.4;
        const ey = c - R * 0.12 + tiltY * 1.4;
        const eye = ctx.createRadialGradient(ex, ey, 0, ex, ey, R * 0.14);
        eye.addColorStop(0, 'rgba(220,240,255,' + eyeAlpha.toFixed(3) + ')');
        eye.addColorStop(1, 'rgba(220,240,255,0)');
        ctx.fillStyle = eye;
        ctx.beginPath();
        ctx.ellipse(ex, ey, R * 0.14, R * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    /* Glas-Glanzlicht wandert mit dem Zeiger */
    ctx.globalCompositeOperation = 'screen';
    const spec = ctx.createRadialGradient(
      c - R * 0.38 + tiltX * 2.2, c - R * 0.42 + tiltY * 2.2, 0,
      c - R * 0.38 + tiltX * 2.2, c - R * 0.42 + tiltY * 2.2, R * 0.55,
    );
    spec.addColorStop(0, 'rgba(255,255,255,0.20)');
    spec.addColorStop(0.4, 'rgba(200,220,255,0.06)');
    spec.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(c - R, c - R, R * 2, R * 2);
    ctx.restore();

    /* Zarter Chrom-Rand + Außenglühen */
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(190,180,255,0.35)';
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(c, c, R * 0.9, c, c, R * 1.35);
    halo.addColorStop(0, 'rgba(120,80,255,0.16)');
    halo.addColorStop(1, 'rgba(120,80,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c, c, R * 1.35, 0, Math.PI * 2);
    ctx.fill();

    /* Ringe + Module vor der Kugel */
    ctx.globalCompositeOperation = 'lighter';
    ringPoints.forEach((pts, ri) => strokeRing(pts, true, RINGS[ri].alpha * 2.2 * (1 + burst)));
    drawModules(true);

    /* Start-Burst: heller Blitz + expandierender Lichtring */
    if (burstStart >= 0) {
      const flash = ctx.createRadialGradient(c, c, 0, c, c, R * 1.4);
      flash.addColorStop(0, 'rgba(255,255,255,' + (0.5 * (1 - burst)).toFixed(3) + ')');
      flash.addColorStop(1, 'rgba(157,77,255,0)');
      ctx.fillStyle = flash;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(0,245,255,' + (0.7 * (1 - burst)).toFixed(3) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(c, c, R * (0.6 + burst * 1.2), 0, Math.PI * 2);
      ctx.stroke();
      if (burst >= 1) burstStart = -1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function loop(now) {
    drawFrame(now);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    resize();
    if (reducedMotion) { drawFrame(performance.now()); return; }
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  /* Öffnet den Core (Licht-Burst) — für den Übergang in den Workspace */
  function burst() {
    burstStart = performance.now();
    if (reducedMotion) drawFrame(burstStart);
  }

  window.addEventListener('resize', resize, { passive: true });
  window.Quantum.core = { start, stop, burst };
})();
