/* QUANTUM — Browser Game Studio
   Port of the uploaded Pydantic Game Agent workflow for the standalone,
   browser-only Quantum Neon Chat: design -> build -> review -> repair. */
window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const BLOCKED = [
    /<script[^>]+src=/i, /\bfetch\s*\(/i, /XMLHttpRequest/i, /WebSocket/i,
    /EventSource/i, /localStorage/i, /sessionStorage/i, /indexedDB/i,
    /document\.cookie/i, /location\s*[.=]/i, /<iframe/i, /<object/i, /<embed/i,
  ];

  /* Anzeigename des Providers, den das Gateway in result.provider bzw.
     error.provider mitliefert. Unbekannt/leer → neutrales "KI-Modell". */
  const PROVIDER_LABELS = { gemini: 'Gemini', groq: 'Groq', nvidia: 'NVIDIA/Qwen', openrouter: 'OpenRouter', custom: 'Custom-Gateway' };
  function providerLabel(id) {
    return PROVIDER_LABELS[String(id || '').toLowerCase()] || 'KI-Modell';
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  function titleFrom(prompt) {
    const clean = prompt.replace(/[^\wäöüÄÖÜß\s-]/g, '').trim();
    return (clean || 'Quantum Neon Challenge').split(/\s+/).slice(0, 6).join(' ');
  }

  function design(prompt) {
    const lower = prompt.toLowerCase();
    const mode = /reaktion|klick|click|treffer|ziel/.test(lower) ? 'target' :
      /ausweich|dodge|meteor|hindernis/.test(lower) ? 'dodge' : 'collect';
    return {
      title: titleFrom(prompt), mode,
      objective: mode === 'target' ? 'Triff so viele Neon-Ziele wie möglich.' :
        mode === 'dodge' ? 'Weiche den roten Impulsen aus und überlebe.' :
          'Sammle die leuchtenden Quantenpunkte vor Ablauf der Zeit.',
      duration: 30,
    };
  }

  function build(spec) {
    const targetColor = spec.mode === 'dodge' ? '#ff3b81' : '#26f7ff';
    const clickBehavior = spec.mode === 'dodge'
      ? "if(e.target===orb){end('Getroffen!');return}score++;"
      : "if(e.target===orb){score++;move();render()}";
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(spec.title)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% 20%,#281052,#05030c 65%);color:#eefcff;font:600 16px system-ui;overflow:hidden}.game{width:min(92vw,760px);text-align:center}.hud{display:flex;justify-content:space-between;margin:12px 0;color:#b9a8ff}.arena{position:relative;height:min(64vh,480px);border:1px solid #8c52ff;border-radius:24px;background:#090616;box-shadow:0 0 40px #7c3aed55 inset,0 0 30px #22d3ee22;overflow:hidden}.orb{position:absolute;width:64px;height:64px;border:0;border-radius:50%;background:${targetColor};box-shadow:0 0 18px ${targetColor},0 0 42px ${targetColor};cursor:pointer;transition:transform .12s}.orb:active{transform:scale(.82)}button{font:inherit;color:white;background:#6d28d9;border:1px solid #c084fc;border-radius:12px;padding:10px 18px;cursor:pointer}#overlay{position:absolute;inset:0;display:grid;place-items:center;background:#05030cdd;font-size:1.4rem;z-index:3}small{display:block;color:#9ca3af;margin:8px}</style></head><body><main class="game"><h1>${esc(spec.title)}</h1><p>${esc(spec.objective)}</p><div class="hud"><span>Punkte: <b id="score">0</b></span><span>Zeit: <b id="time">${spec.duration}</b>s</span></div><section class="arena" id="arena"><div id="overlay"><div>Bereit?<br><button id="start">SPIEL STARTEN</button></div></div><button class="orb" id="orb" aria-label="Neon-Ziel"></button></section><small>Maus oder Touch · R startet neu</small></main><script>const arena=document.querySelector('#arena'),orb=document.querySelector('#orb'),overlay=document.querySelector('#overlay'),scoreEl=document.querySelector('#score'),timeEl=document.querySelector('#time');let score=0,time=${spec.duration},timer,running=false;function render(){scoreEl.textContent=score;timeEl.textContent=time}function move(){const x=Math.random()*(arena.clientWidth-70),y=Math.random()*(arena.clientHeight-70);orb.style.left=x+'px';orb.style.top=y+'px'}function start(){clearInterval(timer);score=0;time=${spec.duration};running=true;overlay.style.display='none';move();render();timer=setInterval(()=>{time--;render();if(time<=0)end('Zeit vorbei!')},1000)}function end(msg){running=false;clearInterval(timer);overlay.style.display='grid';overlay.innerHTML='<div>'+msg+'<br>Score: '+score+'<br><button id="again">NOCHMAL</button></div>';document.querySelector('#again').onclick=start}arena.addEventListener('click',e=>{if(!running)return;${clickBehavior}});document.querySelector('#start').onclick=start;addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')start()});render();<\/script></body></html>`;
  }

  function review(html) {
    const issues = BLOCKED.filter((rule) => rule.test(html)).map((rule) => 'Unsichere Browser-API: ' + rule);
    ['<!doctype html>', '</script>', '</body>', '</html>'].forEach((required) => {
      if (!html.toLowerCase().includes(required.toLowerCase())) issues.push('Fehlt: ' + required);
    });
    if (!/<button\b/i.test(html) && !/(start|play|restart|neustart|nochmal)/i.test(html)) {
      issues.push('Es fehlt eine erkennbare Start- oder Neustart-Steuerung.');
    }
    if (!/name=["']viewport["']/i.test(html)) {
      issues.push('Fehlt: <meta name="viewport"> für Mobilgeräte.');
    }
    issues.push(...scriptIssues(html));
    return { approved: issues.length === 0, issues };
  }

  /* Prüft jedes Inline-Skript auf Syntaxfehler: fängt vor allem Spiele ab,
     deren Logik am Token-Limit abgeschnitten wurde (hübsche Hülle, toter
     Start-Knopf). new Function parst den Code, ohne ihn auszuführen. */
  function scriptIssues(html) {
    const issues = [];
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (!match[1].trim()) continue;
      try {
        new Function(match[1]);
      } catch (error) {
        issues.push('JavaScript unvollständig oder fehlerhaft: ' + error.message);
      }
    }
    return issues;
  }

  function repair(html) {
    let out = html.replace(/<script[^>]+src=[^>]*><\/script>/gi, '')
      .replace(/<(iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
      .trim();
    /* Am Token-Limit abgeschnittene Dokumente schließen: fehlende
       </script>/</body>/</html> anhängen und Doctype ergänzen. */
    const openScripts = (out.match(/<script\b/gi) || []).length;
    const closedScripts = (out.match(/<\/script>/gi) || []).length;
    if (openScripts > closedScripts) out += '</script>'.repeat(openScripts - closedScripts);
    if (/<body\b/i.test(out) && !/<\/body>/i.test(out)) out += '</body>';
    if (/<html\b/i.test(out) && !/<\/html>/i.test(out)) out += '</html>';
    if (!/<!doctype html>/i.test(out)) out = '<!doctype html>' + out;
    /* Handy-Tauglichkeit: fehlendes Viewport-Meta nachrüsten */
    if (!/name=["']viewport["']/i.test(out)) {
      const meta = '<meta name="viewport" content="width=device-width,initial-scale=1">';
      out = /<head[^>]*>/i.test(out)
        ? out.replace(/<head[^>]*>/i, '$&' + meta)
        : out.replace(/<!doctype html>/i, '$&' + meta);
    }
    return out;
  }

  function preview(html, name) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) {
      const link = document.createElement('a');
      link.href = url;
      link.download = name + '.html';
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  window.Quantum.gameAgent = { design, build, review, repair };

  window.Quantum.skills.register({
    id: 'game', icon: '🎮', name: 'Browser Game Studio',
    desc: 'Entwickelt und prüft ein spielbares Browser-Game',
    usage: '/skill game Neon-Reaktionsspiel mit 30 Sekunden Timer',
    async run(input) {
      const prompt = input.trim();
      if (!prompt) return 'Beschreibe dein Spiel, z. B. `/skill game Neon-Reaktionsspiel mit 30 Sekunden Timer`.';
      const spec = design(prompt);
      let html = null;
      let model = 'lokaler Fallback';
      let usedFallback = false;
      let aiStatus;
      try {
        /* Bevorzugt den Streaming-Endpunkt (umgeht Netlifys 10-s-Limit und
           erlaubt größere Spiele); fällt bei Stream-Problemen auf den
           klassischen Aufruf mit kompakterem Budget zurück. */
        const ai = window.Quantum.ai;
        const request = {
          system: 'You are an award-winning browser game studio. Return only one complete standalone HTML document with embedded CSS and JavaScript.'
            + ' The game must be immediately playable and feel polished, with a neon-cyberpunk look: dark background (#0a0a18), glowing accents'
            + ' (cyan #26f7ff, magenta #ff3b81), CSS glow/box-shadow effects, a centered responsive layout and clean typography.'
            + ' Render the game on a large <canvas> with smooth requestAnimationFrame animation and juicy feedback:'
            + ' particles, flashes or shake on scoring and losing.'
            + ' The layout must be mobile-first and fit ENTIRELY into one phone viewport with no page scrolling:'
            + ' include <meta name="viewport" content="width=device-width, initial-scale=1">, use a flex column sized with 100dvh (fallback 100vh),'
            + ' size the canvas from the remaining flex space instead of fixed pixels, keep header and HUD compact,'
            + ' and keep on-screen touch controls small and fully visible above the bottom edge (respect env(safe-area-inset-bottom)).'
            + ' Include a title, short instructions, a live score display,'
            + ' gradually increasing difficulty, a clear win/loss state and a start/restart button. Support both keyboard and touch controls.'
            + ' All visible text must be German. No explanation, no markdown fences, no external assets, fonts, libraries, network calls,'
            + ' browser storage, navigation, iframe, object or embed. Do not think out loud or plan in prose — start with <!doctype html> immediately.',
          prompt: 'Create this browser game: ' + prompt,
          temperature: 0.45,
        };
        let result;
        if (ai.askStream) {
          try {
            /* Großzügiges Budget: Denk-Modelle (z. B. gpt-oss) verbrauchen
               erst Reasoning-Tokens, bevor der eigentliche Code kommt. */
            result = await ai.askStream({ ...request, maxTokens: 14000 });
          } catch (_) {
            result = await ai.ask({ ...request, maxTokens: 2200 });
          }
        } else {
          result = await ai.ask({ ...request, maxTokens: 2200 });
        }
        const extracted = window.Quantum.modelResponse.extractHtml(result.text);
        if (extracted) {
          html = extracted;
          model = result.model || 'unbekanntes Modell';
          aiStatus = '✓ ' + providerLabel(result.provider) + ' erfolgreich (`' + model + '`)';
        } else {
          usedFallback = true;
          const snippet = String(result.text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
          aiStatus = '⚠️ ' + providerLabel(result.provider) + ' lieferte kein verwertbares HTML (`' + (result.model || 'unbekanntes Modell') + '`'
            + (result.finishReason ? ', finish: ' + result.finishReason : '') + ') – lokaler Fallback aktiv'
            + (snippet ? '\n· Antwortanfang: „' + snippet + '…“' : '');
        }
      } catch (error) {
        usedFallback = true;
        aiStatus = '⚠️ ' + providerLabel(error.provider) + ' fehlgeschlagen (`' + (error.model || 'Modell unbekannt') + '`): '
          + (error.message || 'nicht erreichbar') + ' – lokaler Fallback aktiv';
      }
      if (usedFallback) {
        html = build(spec);
        model = 'lokaler Fallback';
      }
      let report = review(html);
      const hadIssues = !report.approved;
      let repaired = false;
      if (hadIssues || usedFallback) {
        html = repair(html);
        report = review(html);
        repaired = true;
      }
      /* KI-Spiel ist auch nach der Reparatur nicht lauffähig (z. B. am
         Token-Limit abgeschnittene Spiellogik): lieber ein funktionierendes
         lokales Spiel liefern als eine hübsche, aber tote Hülle. */
      if (!report.approved && !usedFallback) {
        aiStatus = '⚠️ ' + providerLabel() + '-Code (`' + model + '`) war nicht spielbar – lokaler Fallback aktiv'
          + '\n· Review: ' + report.issues.join(' · ');
        usedFallback = true;
        html = repair(build(spec));
        model = 'lokaler Fallback';
        report = review(html);
        repaired = true;
      }
      if (!report.approved) return '🎮 Der Entwurf wurde aus Sicherheitsgründen abgelehnt:\n· ' + report.issues.join('\n· ');
      preview(html, spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      return [
        '🎮 **BROWSER GAME STUDIO**',
        aiStatus,
        '✓ Game Designer: Spezifikation erstellt (' + spec.mode + ')',
        '✓ Game Builder: eigenständige HTML-Datei gebaut (`' + model + '`)',
        '✓ Game Reviewer: Spielbarkeit und Sandbox-Regeln geprüft',
        repaired
          ? '✓ Repair Agent: automatisch ausgeführt (' + (hadIssues ? 'Validierungsfehler korrigiert' : 'Fallback-Ausgabe bereinigt') + ')'
          : '✓ Repair Agent: nicht nötig',
        '',
        '**' + spec.title + '** wurde in einem neuen Browser-Tab gestartet.',
        'Falls dein Browser Pop-ups blockiert, wird die HTML-Datei stattdessen heruntergeladen.',
      ].join('\n');
    },
  });
})();
