/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Remotion Video Studio
   Skill "video": generiert per KI eine fertige Remotion-Composition
   (React/TSX), die du lokal zu MP4 renderst:
     npm i remotion @remotion/cli
     npx remotion render MyVideo out/video.mp4
   Remotion rendert serverseitig (Node/Chromium) und läuft nicht im
   statischen Browser — daher liefern wir Code + Render-Anleitung.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const PROVIDER_LABELS = { gemini: 'Gemini', groq: 'Groq', nvidia: 'NVIDIA/Qwen', openrouter: 'OpenRouter', custom: 'Custom-Gateway' };
  function providerLabel(id) { return PROVIDER_LABELS[String(id || '').toLowerCase()] || 'KI-Modell'; }

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

  const ROOT_TSX = `import React from 'react';
import { Composition } from 'remotion';
import { MyVideo } from './MyVideo';

export const RemotionRoot: React.FC = () => (
  <Composition id="MyVideo" component={MyVideo} durationInFrames={150} fps={30} width={1920} height={1080} />
);
`;

  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  window.Quantum.videoStudio = { extractCode, fallbackComposition };

  window.Quantum.skills.register({
    id: 'video', icon: '🎬', name: 'Remotion Video Studio',
    desc: 'Generiert eine Remotion-Composition (TSX) zum Rendern',
    usage: '/skill video 10s Intro mit Neon-Logo und Titel',
    async run(input) {
      const prompt = input.trim();
      if (!prompt) return 'Beschreibe dein Video, z. B. `/skill video 10s Intro mit Neon-Logo, Titel und Partikeln`.';

      const ai = window.Quantum.ai;
      let code = null;
      let model = 'lokaler Fallback';
      let status;
      const request = {
        system: 'You are a senior Remotion (v4) motion designer. Return ONE complete, self-contained Remotion composition as a single TSX file.'
          + ' Export a React component named MyVideo. Import only from "remotion" and "react" (AbsoluteFill, useCurrentFrame, interpolate, spring,'
          + ' useVideoConfig, Sequence). No external assets, images, fonts, audio or network. Use inline styles only. Neon-cyberpunk look:'
          + ' dark background, glowing cyan (#26f7ff) and magenta (#ff3b81) accents. Smooth animation driven by useCurrentFrame/interpolate/spring.'
          + ' Assume 30 fps, 1920x1080. Output ONLY the TSX code in a single ```tsx code block, no explanation.',
        prompt: 'Create this Remotion video: ' + prompt,
        temperature: 0.5,
      };

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
      download('MyVideo.tsx', code, 'text/plain');
      download('Root.tsx', ROOT_TSX, 'text/plain');

      return [
        '🎬 **REMOTION VIDEO STUDIO**',
        status,
        '',
        '✓ `MyVideo.tsx` und `Root.tsx` wurden heruntergeladen.',
        '',
        '**So renderst du dein Video zu MP4:**',
        '1. `npm i remotion @remotion/cli react react-dom`',
        '2. `MyVideo.tsx` + `Root.tsx` ins `src/` deines Remotion-Projekts legen',
        '   (neu: `npx create-video@latest`), Root in `src/index.ts` registrieren',
        '3. Vorschau: `npx remotion studio` · Rendern: `npx remotion render MyVideo out/video.mp4`',
      ].join('\n');
    },
  });
})();
