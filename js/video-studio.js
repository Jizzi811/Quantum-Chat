/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Remotion Video Studio
   Skill "video": generiert per KI eine Remotion-Composition (TSX)
   und zeigt sie SOFORT in einer Live-Vorschau im Browser an –
   ganz ohne manuelles Rendern. Für das finale MP4 liefern wir den
   Code + die Anleitung fürs eigene Remotion-Studio:
     npm i remotion @remotion/cli
     npx remotion studio           (eigenes Studio, Vorschau/Scrub)
     npx remotion render MyVideo out/video.mp4
   Die Live-Vorschau nutzt React + Babel (im isolierten iframe) mit
   einem schlanken Remotion-Shim, damit du dein Video direkt siehst.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const PROVIDER_LABELS = { gemini: 'Gemini', groq: 'Groq', nvidia: 'NVIDIA/Qwen', openrouter: 'OpenRouter', custom: 'Custom-Gateway' };
  function providerLabel(id) { return PROVIDER_LABELS[String(id || '').toLowerCase()] || 'KI-Modell'; }

  const DEFAULT_SECONDS = 8;
  const MIN_SECONDS = 2;
  const MAX_SECONDS = 120;
  const FPS = 30;
  const WIDTH = 1920;
  const HEIGHT = 1080;

  function clampSeconds(s) {
    const n = Number(s);
    if (!isFinite(n) || n <= 0) return DEFAULT_SECONDS;
    return Math.min(Math.max(Math.round(n), MIN_SECONDS), MAX_SECONDS);
  }

  /* Liest die gewünschte Länge aus dem Prompt (z. B. „10s", „2 min", „1:30"). Reine Funktion. */
  function parseDuration(text) {
    const t = String(text || '').toLowerCase();
    let m;
    if ((m = t.match(/\b(\d{1,2}):([0-5]?\d)\b/))) return clampSeconds((+m[1]) * 60 + (+m[2]));
    if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*min(?:uten|ute)?\b/))) return clampSeconds(parseFloat(m[1].replace(',', '.')) * 60);
    if ((m = t.match(/(\d+)\s*(?:sek(?:unden|unde)?|sec(?:onds|ond)?|s)\b/))) return clampSeconds(+m[1]);
    return DEFAULT_SECONDS;
  }

  /* Zieht den TSX/JSX/TS-Codeblock aus der Modell-Antwort. Reine Funktion. */
  function extractCode(text) {
    const raw = String(text || '');
    const fence = raw.match(/```(?:tsx|jsx|ts|js|typescript|javascript)?\s*\n([\s\S]*?)```/i);
    let code = fence ? fence[1] : raw;
    code = code.trim();
    /* Plausibilität: muss nach einer Remotion-Composition aussehen. */
    if (!/export\s+(const|default|function)/.test(code) || !/remotion/i.test(code)) return null;
    return code;
  }

  /* Lokales Fallback-Template, falls kein KI-Zugang / keine brauchbare Antwort. */
  function fallbackComposition(title) {
    const safe = String(title || 'Quantum Clip').replace(/[`$\\]/g, '').slice(0, 60) || 'Quantum Clip';
    return `import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

// Von QUANTUM generiert – rendern mit: npx remotion render MyVideo out/video.mp4
export const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(frame, [0, 20, durationInFrames - 20, durationInFrames], [0, 1, 1, 0]);
  const scale = interpolate(enter, [0, 1], [0.8, 1]);
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 30%, #281052, #05030c 65%)', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, transform: \`scale(\${scale})\`, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#26f7ff', fontSize: 90, margin: 0, textShadow: '0 0 30px #26f7ff' }}>${safe}</h1>
        <p style={{ color: '#ff3b81', fontSize: 34, letterSpacing: 6 }}>powered by NADJ.AI</p>
      </div>
    </AbsoluteFill>
  );
};
`;
  }

  /* Root-Composition mit dynamischer Dauer. Reine Funktion. */
  function rootTsx(durationInFrames, fps, width, height) {
    return `import React from 'react';
import { Composition } from 'remotion';
import { MyVideo } from './MyVideo';

export const RemotionRoot: React.FC = () => (
  <Composition id="MyVideo" component={MyVideo} durationInFrames={${durationInFrames}} fps={${fps}} width={${width}} height={${height}} />
);
`;
  }

  /* Macht generiertes TSX im Browser lauffähig: Imports raus (Namen kommen
     als Globals aus dem Shim), Exports in normale/Window-Zuweisungen. Reine Funktion. */
  function stripForBrowser(code) {
    return String(code || '')
      .replace(/^[ \t]*import[^\n]*\n/gm, '')
      .replace(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/g, 'window.__default = function $1')
      .replace(/export\s+default\s+/g, 'window.__default = ')
      .replace(/export\s+const\s+/g, 'const ')
      .replace(/export\s+function\s+/g, 'function ')
      .replace(/export\s+/g, '');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── Live-Vorschau-Bausteine (laufen im isolierten iframe) ──────── */

  const STUDIO_CSS =
    '*{box-sizing:border-box;margin:0;padding:0}' +
    "html,body{height:100%;background:#05030c;color:#e7e9ff;font-family:'Rajdhani',system-ui,sans-serif}" +
    '.qs-root{display:flex;flex-direction:column;gap:10px;height:100%;padding:12px}' +
    '.qs-viewport{position:relative;width:100%;aspect-ratio:__W__ / __H__;overflow:hidden;background:#000;' +
    'border:1px solid rgba(38,247,255,0.25);border-radius:12px;box-shadow:0 0 30px rgba(38,247,255,0.15)}' +
    '.qs-scale{position:absolute;top:0;left:0;transform-origin:top left}' +
    '.qs-canvas{position:relative;overflow:hidden}' +
    '.qs-bar{display:flex;align-items:center;gap:12px}' +
    '.qs-btn{flex:0 0 auto;width:46px;height:40px;font-size:18px;color:#05030c;cursor:pointer;' +
    'background:linear-gradient(90deg,#26f7ff,#ff3b81);border:none;border-radius:10px}' +
    '.qs-range{flex:1 1 auto;accent-color:#26f7ff}' +
    '.qs-time{flex:0 0 auto;font-variant-numeric:tabular-nums;font-size:13px;color:#9fb2ff;min-width:118px;text-align:right}' +
    '.qs-export{background:#12203a;color:#26f7ff;border:1px solid rgba(38,247,255,0.4)}' +
    '.qs-note{flex:0 0 auto;font-size:12px;color:#26f7ff;min-width:110px}' +
    '.qs-btn:disabled,.qs-range:disabled{opacity:0.5;cursor:default}' +
    '.qs-err{color:#ff6b6b;padding:20px;font-family:system-ui}';

  /* Remotion-Shim + Mini-Player, plain JS via React.createElement (kein Build nötig). */
  const RUNTIME_JS = `(function(){
  var React = window.React, ReactDOM = window.ReactDOM;
  if(!React || !ReactDOM){ return; }
  var h = React.createElement;
  var CFG = window.__CFG || { fps:30, width:1920, height:1080, durationInFrames:150, title:'Clip' };
  var FrameContext = React.createContext(0);

  function useCurrentFrame(){ return React.useContext(FrameContext); }
  function useVideoConfig(){ return { fps:CFG.fps, width:CFG.width, height:CFG.height, durationInFrames:CFG.durationInFrames, id:'MyVideo', defaultProps:{}, props:{} }; }

  function interpolate(input, inRange, outRange, opts){
    opts = opts || {};
    var eL = opts.extrapolateLeft || 'extend';
    var eR = opts.extrapolateRight || 'extend';
    var n = inRange.length;
    if(input <= inRange[0]){ if(eL === 'clamp') return outRange[0]; if(eL === 'identity') return input; }
    if(input >= inRange[n-1]){ if(eR === 'clamp') return outRange[n-1]; if(eR === 'identity') return input; }
    var i = 0;
    for(; i < n - 1; i++){ if(input < inRange[i+1]) break; }
    if(i > n - 2) i = n - 2;
    var inMin = inRange[i], inMax = inRange[i+1], outMin = outRange[i], outMax = outRange[i+1];
    var p = (inMax === inMin) ? 0 : (input - inMin) / (inMax - inMin);
    if(typeof opts.easing === 'function'){ p = opts.easing(Math.min(Math.max(p,0),1)); }
    return outMin + p * (outMax - outMin);
  }

  function spring(o){
    o = o || {};
    var frame = o.frame || 0, fps = o.fps || CFG.fps, c = o.config || {};
    var from = (o.from == null) ? 0 : o.from, to = (o.to == null) ? 1 : o.to;
    var damping = (c.damping == null) ? 10 : c.damping;
    var mass = (c.mass == null) ? 1 : c.mass;
    var stiffness = (c.stiffness == null) ? 100 : c.stiffness;
    var t = frame / fps;
    var w0 = Math.sqrt(stiffness / mass);
    var zeta = damping / (2 * Math.sqrt(stiffness * mass));
    var y;
    if(zeta < 1){
      var wd = w0 * Math.sqrt(1 - zeta * zeta);
      y = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
    } else {
      y = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    }
    return from + (to - from) * y;
  }

  var AbsoluteFill = React.forwardRef(function(props, ref){
    var style = Object.assign({ position:'absolute', top:0, left:0, width:'100%', height:'100%', display:'flex', flexDirection:'column' }, props.style || {});
    var rest = {}; for(var k in props){ if(k !== 'style') rest[k] = props[k]; }
    rest.ref = ref; rest.style = style;
    return h('div', rest);
  });

  function Sequence(props){
    var parent = React.useContext(FrameContext);
    var from = props.from || 0;
    var dur = (props.durationInFrames == null) ? Infinity : props.durationInFrames;
    var local = parent - from;
    if(local < 0 || local >= dur) return null;
    var kids = h(FrameContext.Provider, { value: local }, props.children);
    if(props.layout === 'none') return kids;
    var style = Object.assign({ position:'absolute', top:0, left:0, width:'100%', height:'100%' }, props.style || {});
    return h('div', { style: style }, kids);
  }

  function Series(props){
    var parent = React.useContext(FrameContext);
    var offset = 0; var out = [];
    React.Children.forEach(props.children, function(child, idx){
      if(!child || !child.props) return;
      var d = child.props.durationInFrames || 0;
      var local = parent - offset;
      if(local >= 0 && local < d){ out.push(h(FrameContext.Provider, { key: idx, value: local }, child.props.children)); }
      offset += d;
    });
    return h('div', { style:{ position:'absolute', top:0, left:0, width:'100%', height:'100%' } }, out);
  }
  Series.Sequence = function(p){ return p.children; };

  function Img(props){ return h('img', props); }
  function Noop(){ return null; }
  function staticFile(s){ return s; }
  function random(seed){ var x = Math.sin((typeof seed === 'number' ? seed : 1) * 99991) * 10000; return x - Math.floor(x); }

  var api = {
    AbsoluteFill: AbsoluteFill, Sequence: Sequence, Series: Series, Img: Img,
    Audio: Noop, Video: Noop, OffthreadVideo: Noop, IFrame: Noop,
    useCurrentFrame: useCurrentFrame, useVideoConfig: useVideoConfig,
    interpolate: interpolate, spring: spring, staticFile: staticFile, random: random,
    continueRender: function(){}, delayRender: function(){ return 0; },
    Freeze: function(p){ return p.children; }, Easing: {}
  };
  Object.keys(api).forEach(function(k){ window[k] = api[k]; });
  window.Remotion = api;
  ['useState','useEffect','useMemo','useRef','useCallback','useContext','Fragment','createElement','forwardRef','memo'].forEach(function(k){ window[k] = React[k]; });
  window.FrameContext = FrameContext;

  function Stage(props){
    var Comp = window.__MyVideo;
    var inner = Comp
      ? h(FrameContext.Provider, { value: Math.floor(props.frame) }, h(Comp))
      : h('div', { className:'qs-err' }, 'Keine MyVideo-Composition gefunden.');
    return h('div', { className:'qs-canvas', style:{ width: CFG.width + 'px', height: CFG.height + 'px' } }, inner);
  }

  function sleep(ms){ return new Promise(function(r){ setTimeout(r, Math.max(0, ms)); }); }
  function nextPaint(){ return new Promise(function(r){ requestAnimationFrame(function(){ r(); }); }); }

  function pickMime(){
    if(!window.MediaRecorder) return '';
    var list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for(var i=0;i<list.length;i++){ try { if(MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch(e){} }
    return '';
  }

  /* Zeichnet den (unskalierten) 1920x1080-Composition-DOM per SVG/foreignObject
     auf ein Canvas – nutzt nur Inline-Styles, daher kein CORS/Taint. */
  function drawDomToCanvas(node, ctx, W, H){
    return new Promise(function(resolve, reject){
      var xml = new XMLSerializer().serializeToString(node);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'
        + '<foreignObject width="100%" height="100%">'
        + '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + W + 'px;height:' + H + 'px;overflow:hidden">'
        + xml + '</div></foreignObject></svg>';
      var img = new Image();
      img.onload = function(){ ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H); resolve(); };
      img.onerror = function(){ reject(new Error('Frame konnte nicht gezeichnet werden.')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function dl(blob, name){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); if(a.parentNode) a.parentNode.removeChild(a); }, 60000);
  }

  function App(){
    var fs = React.useState(0), frame = fs[0], setFrame = fs[1];
    var ps = React.useState(true), playing = ps[0], setPlaying = ps[1];
    var xs = React.useState(null), exp = xs[0], setExp = xs[1]; // null | 0..1 (Fortschritt) | 'err'
    var busy = typeof exp === 'number';

    React.useEffect(function(){
      if(!playing || busy) return;
      var raf, startT = performance.now(), base = frame;
      function loop(now){
        var f = base + ((now - startT) / 1000) * CFG.fps;
        if(f >= CFG.durationInFrames){ base = 0; startT = now; setFrame(0); }
        else { setFrame(f); }
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
      return function(){ cancelAnimationFrame(raf); };
    }, [playing, busy]);

    async function doExport(){
      var mime = pickMime();
      if(!mime){ setExp('err'); setTimeout(function(){ setExp(null); }, 4000); return; }
      setPlaying(false); setExp(0);
      await nextPaint();
      var W = CFG.width, H = CFG.height, total = CFG.durationInFrames;
      var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');
      var stream = canvas.captureStream(0);
      var track = stream.getVideoTracks()[0];
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
      var chunks = [];
      rec.ondataavailable = function(e){ if(e.data && e.data.size) chunks.push(e.data); };
      var stopped = new Promise(function(res){ rec.onstop = res; });
      var dt = 1000 / CFG.fps;
      try {
        rec.start();
        var t0 = performance.now();
        for(var f = 0; f < total; f++){
          setFrame(f);
          await nextPaint();
          await drawDomToCanvas(document.querySelector('.qs-canvas'), ctx, W, H);
          if(track.requestFrame) track.requestFrame();
          setExp((f + 1) / total);
          // Frame-Takt an die Ziel-fps koppeln, damit die Wiedergabe-Geschwindigkeit stimmt.
          await sleep((t0 + (f + 1) * dt) - performance.now());
        }
        rec.stop();
        await stopped;
        var ext = (mime.indexOf('mp4') >= 0) ? 'mp4' : 'webm';
        dl(new Blob(chunks, { type: mime.split(';')[0] }), 'quantum-video.' + ext);
        setExp(null); setFrame(0); setPlaying(true);
      } catch(err){
        try { rec.stop(); } catch(e){}
        setExp('err'); setTimeout(function(){ setExp(null); }, 4000);
      }
    }

    var cur = Math.floor(frame);
    var secs = (cur / CFG.fps).toFixed(2);
    var total = (CFG.durationInFrames / CFG.fps).toFixed(2);
    var note = (exp === 'err') ? 'Export hier nicht möglich' : (busy ? 'Export ' + Math.round(exp * 100) + '%' : '');
    return h('div', { className:'qs-root' },
      h('div', { className:'qs-viewport' }, h('div', { className:'qs-scale', id:'qs-scale' }, h(Stage, { frame: frame }))),
      h('div', { className:'qs-bar' },
        h('button', { className:'qs-btn', title: playing ? 'Pause' : 'Play', disabled: busy, onClick: function(){ setPlaying(!playing); } }, playing ? '\\u23F8' : '\\u25B6'),
        h('input', { className:'qs-range', type:'range', min:0, max: Math.max(0, CFG.durationInFrames - 1), step:1, value: cur, disabled: busy, onChange: function(e){ setPlaying(false); setFrame(Number(e.target.value)); } }),
        h('span', { className:'qs-time' }, secs + 's / ' + total + 's'),
        h('button', { className:'qs-btn qs-export', title:'Als Video (.webm) exportieren', disabled: busy, onClick: doExport }, busy ? '\\u2026' : '\\u2B07'),
        note ? h('span', { className:'qs-note' }, note) : null
      )
    );
  }

  function fit(){
    var vp = document.querySelector('.qs-viewport');
    var sc = document.getElementById('qs-scale');
    if(!vp || !sc) return;
    sc.style.transform = 'scale(' + (vp.clientWidth / CFG.width) + ')';
  }

  window.__mountStudio = function(){
    if(window.__mounted) return;
    var el = document.getElementById('qs-mount');
    if(!el) return;
    window.__mounted = true;
    ReactDOM.createRoot(el).render(h(App));
    setTimeout(fit, 0);
    window.addEventListener('resize', fit);
    if(window.ResizeObserver){ new ResizeObserver(fit).observe(document.body); }
  };
})();`;

  /* Baut ein komplettes, eigenständiges Studio-HTML mit Live-Player. Reine Funktion. */
  function buildStudioHtml(opts) {
    opts = opts || {};
    const fps = opts.fps || FPS;
    const width = opts.width || WIDTH;
    const height = opts.height || HEIGHT;
    const seconds = clampSeconds(opts.seconds || DEFAULT_SECONDS);
    const durationInFrames = Math.max(1, Math.round(seconds * fps));
    const title = String(opts.title || 'Quantum Clip');
    const cfg = { fps: fps, width: width, height: height, durationInFrames: durationInFrames, title: title };
    const css = STUDIO_CSS.replace(/__W__/g, String(width)).replace(/__H__/g, String(height));
    const user = stripForBrowser(opts.code || '').replace(/<\/script>/gi, '<\\/script>');
    return [
      '<!doctype html>',
      '<html lang="de"><head><meta charset="utf-8"/>',
      '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
      '<title>' + escapeHtml(title) + ' — Quantum Studio</title>',
      '<style>' + css + '</style>',
      '</head><body>',
      '<div id="qs-mount" class="qs-root"></div>',
      '<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>',
      '<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>',
      '<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>',
      '<script>window.__CFG=' + JSON.stringify(cfg) + ';<\/script>',
      '<script>' + RUNTIME_JS + '<\/script>',
      '<script type="text/babel" data-presets="typescript,react">',
      user,
      '\n;window.__MyVideo=(typeof MyVideo!=="undefined")?MyVideo:window.__default;',
      '\n;if(window.__mountStudio)window.__mountStudio();',
      '<\/script>',
      '</body></html>',
    ].join('\n');
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* ── KI-Generierung ────────────────────────────────────────────── */

  async function generateComposition(prompt, seconds) {
    const ai = window.Quantum.ai;
    const frames = Math.round(seconds * FPS);
    const request = {
      system: 'You are a senior Remotion (v4) motion designer. Return ONE complete, self-contained Remotion composition as a single TSX file.'
        + ' Export a React component named MyVideo. Import only from "remotion" and "react" (AbsoluteFill, useCurrentFrame, interpolate, spring,'
        + ' useVideoConfig, Sequence). No external assets, images, fonts, audio or network. Use inline styles only. Neon-cyberpunk look:'
        + ' dark background, glowing cyan (#26f7ff) and magenta (#ff3b81) accents. Smooth animation driven by useCurrentFrame/interpolate/spring.'
        + ' Read fps and durationInFrames from useVideoConfig(); never hardcode them. The clip is about ' + seconds + ' seconds long (' + frames + ' frames at ' + FPS + 'fps).'
        + ' Fill the ENTIRE duration with motion — for longer clips, split the timeline into several <Sequence from=... durationInFrames=...> scenes so nothing sits static.'
        + ' Assume ' + WIDTH + 'x' + HEIGHT + '. Output ONLY the TSX code in a single ```tsx code block, no explanation.',
      prompt: 'Create this Remotion video (~' + seconds + 's): ' + prompt,
      temperature: 0.5,
    };

    let code = null;
    let model = 'lokaler Fallback';
    let status;
    try {
      if (!ai || !ai.hasAccess || !ai.hasAccess()) throw Object.assign(new Error('kein KI-Zugang'), { local: true });
      let result;
      if (ai.askStream) {
        try { result = await ai.askStream({ ...request, maxTokens: 9000 }); }
        catch (_) { result = await ai.ask({ ...request, maxTokens: 3000 }); }
      } else {
        result = await ai.ask({ ...request, maxTokens: 3000 });
      }
      const extracted = extractCode(result.text);
      if (extracted) {
        code = extracted;
        model = result.model || 'unbekanntes Modell';
        status = '✓ ' + providerLabel(result.provider) + ' erfolgreich (`' + model + '`)';
      } else {
        status = '⚠️ ' + providerLabel(result.provider) + ' lieferte keinen verwertbaren Remotion-Code – lokales Template genutzt';
      }
    } catch (error) {
      status = error.local
        ? 'ℹ️ Kein KI-Zugang aktiv – lokales Template genutzt (mit 🔑 oben rechts schaltest du die KI-Generierung frei)'
        : '⚠️ ' + providerLabel(error.provider) + ' fehlgeschlagen (`' + (error.model || 'Modell unbekannt') + '`): ' + (error.message || 'nicht erreichbar') + ' – lokales Template genutzt';
    }
    if (!code) code = fallbackComposition(prompt);
    return { code: code, status: status, model: model };
  }

  /* ── Modal (eigenes Studio) ────────────────────────────────────── */

  let modal = null;
  let lastCode = '';
  let lastRoot = '';
  let lastHtml = '';

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'tts-studio video-studio';
    modal.setAttribute('data-testid', 'video-studio');
    modal.innerHTML =
      '<div class="tts-studio__card video-studio__card">' +
      '  <div class="tts-studio__head">' +
      '    <span class="tts-studio__title">🎬 VIDEO-STUDIO</span>' +
      '    <button class="tts-studio__close" data-testid="video-close" title="Schließen">✕</button>' +
      '  </div>' +
      '  <label class="tts-studio__label" for="vid-prompt">Video-Beschreibung</label>' +
      '  <textarea id="vid-prompt" class="tts-studio__text" data-testid="video-prompt" rows="3" maxlength="2000" placeholder="z. B. „Intro mit Neon-Logo, Titel ‚QUANTUM‘ und Partikel-Sog"></textarea>' +
      '  <div class="tts-studio__row">' +
      '    <label class="tts-studio__label">Länge (Sekunden)' +
      '      <input id="vid-seconds" class="tts-studio__num" data-testid="video-seconds" type="number" min="' + MIN_SECONDS + '" max="' + MAX_SECONDS + '" step="1" value="' + DEFAULT_SECONDS + '" />' +
      '    </label>' +
      '  </div>' +
      '  <div class="tts-studio__actions">' +
      '    <button class="tts-studio__generate" data-testid="video-generate">⚡ VIDEO GENERIEREN</button>' +
      '  </div>' +
      '  <div class="tts-studio__status" data-testid="video-status" aria-live="polite"></div>' +
      '  <div class="tts-studio__result" hidden>' +
      '    <iframe class="video-studio__frame" data-testid="video-preview" title="Live-Vorschau" sandbox="allow-scripts allow-downloads" referrerpolicy="no-referrer"></iframe>' +
      '    <div class="video-studio__downloads">' +
      '      <button class="tts-studio__download" data-testid="video-dl-comp" data-kind="comp">⬇ MyVideo.tsx</button>' +
      '      <button class="tts-studio__download" data-kind="root">⬇ Root.tsx</button>' +
      '      <button class="tts-studio__download" data-kind="html">⬇ Studio.html</button>' +
      '    </div>' +
      '    <p class="video-studio__hint">In der Vorschau: <strong>⬇</strong> exportiert das Video direkt als <code>.webm</code> – ganz ohne Rendern. Für ein finales MP4 im eigenen Studio: <code>npx create-video@latest</code> → <code>MyVideo.tsx</code> + <code>Root.tsx</code> in <code>src/</code> → <code>npx remotion studio</code> · <code>npx remotion render MyVideo out/video.mp4</code></p>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);

    const $ = function (sel) { return modal.querySelector(sel); };
    const statusEl = $('.tts-studio__status');
    const resultEl = $('.tts-studio__result');
    const frameEl = $('.video-studio__frame');
    const downloadsEl = $('.video-studio__downloads');
    const genBtn = $('.tts-studio__generate');
    const promptEl = $('#vid-prompt');
    const secEl = $('#vid-seconds');

    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.className = 'tts-studio__status' + (kind ? ' tts-studio__status--' + kind : '');
    }

    async function doGenerate() {
      const prompt = promptEl.value.trim();
      const seconds = clampSeconds(parseInt(secEl.value, 10));
      secEl.value = seconds;
      if (!prompt) { setStatus('Bitte beschreibe erst dein Video.', 'error'); return; }
      genBtn.disabled = true;
      resultEl.hidden = true;
      setStatus('Video wird generiert … (kann einige Sekunden dauern)');
      try {
        const r = await generateComposition(prompt, seconds);
        const frames = Math.round(seconds * FPS);
        lastCode = r.code;
        lastRoot = rootTsx(frames, FPS, WIDTH, HEIGHT);
        lastHtml = buildStudioHtml({ code: r.code, seconds: seconds, fps: FPS, width: WIDTH, height: HEIGHT, title: prompt.slice(0, 60) });
        frameEl.srcdoc = lastHtml;
        resultEl.hidden = false;
        setStatus(r.status, /^✓/.test(r.status) ? 'ok' : null);
      } catch (error) {
        setStatus('⚠ ' + (error.message || 'Generierung fehlgeschlagen.'), 'error');
      } finally {
        genBtn.disabled = false;
      }
    }

    $('.tts-studio__close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    genBtn.addEventListener('click', doGenerate);
    downloadsEl.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-kind]');
      if (!btn) return;
      const kind = btn.getAttribute('data-kind');
      if (kind === 'comp' && lastCode) download('MyVideo.tsx', lastCode, 'text/plain');
      else if (kind === 'root' && lastRoot) download('Root.tsx', lastRoot, 'text/plain');
      else if (kind === 'html' && lastHtml) download('Studio.html', lastHtml, 'text/html');
    });

    modal.__doGenerate = doGenerate;
    return modal;
  }

  function open(prompt, seconds) {
    if (!modal) buildModal();
    modal.hidden = false;
    const promptEl = modal.querySelector('#vid-prompt');
    const secEl = modal.querySelector('#vid-seconds');
    if (prompt) promptEl.value = prompt;
    if (seconds) secEl.value = clampSeconds(seconds);
    promptEl.focus();
    if (prompt) modal.__doGenerate();
  }

  function close() { if (modal) modal.hidden = true; }

  window.Quantum.videoStudio = {
    extractCode: extractCode,
    fallbackComposition: fallbackComposition,
    parseDuration: parseDuration,
    stripForBrowser: stripForBrowser,
    buildStudioHtml: buildStudioHtml,
    rootTsx: rootTsx,
    open: open,
    close: close,
  };

  window.Quantum.skills.register({
    id: 'video', icon: '🎬', name: 'Remotion Video Studio',
    desc: 'Generiert ein Remotion-Video mit Live-Vorschau (ohne Rendern)',
    usage: '/skill video 20s Intro mit Neon-Logo, Titel und Partikeln',
    run(input) {
      const prompt = input.trim();
      const seconds = parseDuration(prompt);
      open(prompt, seconds);
      return prompt
        ? '🎬 **VIDEO-STUDIO** geöffnet — dein ~' + seconds + 's-Video wird generiert und spielt gleich in der Live-Vorschau (kein Rendern nötig).'
        : '🎬 **VIDEO-STUDIO** geöffnet. Beschreibe dein Video, wähle die Länge und drück ⚡ — die Vorschau läuft direkt im Browser, ganz ohne Rendern.';
    },
  });
})();
