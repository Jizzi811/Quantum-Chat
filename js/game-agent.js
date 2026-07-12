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
    return { approved: issues.length === 0, issues };
  }

  function repair(html) {
    return html.replace(/<script[^>]+src=[^>]*><\/script>/gi, '')
      .replace(/<(iframe|object|embed)[\s\S]*?<\/\1>/gi, '');
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
      let html;
      let model = 'lokaler Fallback';
      try {
        const result = await window.Quantum.ai.ask({
          system: 'You are a browser game studio. Return only one compact complete standalone HTML document with embedded CSS and JavaScript, under 300 lines. It must be immediately playable and responsive, with instructions, controls, objective, score, win/loss and a start or restart button. No explanation, markdown fences, external assets, libraries, network calls, browser storage, navigation, iframe, object or embed.',
          prompt: 'Create this compact browser game: ' + prompt,
          temperature: 0.45,
          maxTokens: 4000,
        });
        const fenced = String(result.text).match(/```(?:html)?\s*([\s\S]*?)```/i);
        html = (fenced ? fenced[1] : result.text).trim();
        model = result.model;
      } catch (error) {
        html = build(spec);
        model = 'lokaler Fallback – ' + (error.message || 'NVIDIA nicht erreichbar');
      }
      let report = review(html);
      let repaired = false;
      if (!report.approved) {
        html = repair(html);
        report = review(html);
        repaired = true;
      }
      if (!report.approved) return '🎮 Der Entwurf wurde aus Sicherheitsgründen abgelehnt:\n· ' + report.issues.join('\n· ');
      preview(html, spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      return [
        '🎮 **BROWSER GAME STUDIO**',
        '✓ Game Designer: Spezifikation erstellt (' + spec.mode + ')',
        '✓ Game Builder: eigenständige HTML-Datei gebaut (`' + model + '`)',
        '✓ Game Reviewer: Spielbarkeit und Sandbox-Regeln geprüft',
        repaired ? '✓ Repair Agent: Sicherheitskorrektur durchgeführt' : '✓ Repair Agent: nicht nötig',
        '',
        '**' + spec.title + '** wurde in einem neuen Browser-Tab gestartet.',
        'Falls dein Browser Pop-ups blockiert, wird die HTML-Datei stattdessen heruntergeladen.',
      ].join('\n');
    },
  });
})();
