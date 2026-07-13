window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  function cleanHtml(text) {
    const match = String(text).match(/```(?:html)?\s*([\s\S]*?)```/i);
    return (match ? match[1] : text).trim();
  }

  /* Streaming bevorzugen: umgeht Netlifys 10-Sekunden-Limit für synchrone
     Functions und erlaubt größere Seiten/Antworten. Bei Stream-Problemen
     klassischer Aufruf mit kompakterem Budget als Rückfallebene. */
  async function askPreferStream(request, budget) {
    const ai = window.Quantum.ai;
    if (ai.askStream) {
      try {
        return await ai.askStream({ ...request, maxTokens: budget.stream });
      } catch (_) { /* Fallback unten */ }
    }
    return ai.ask({ ...request, maxTokens: budget.direct });
  }

  function openArtifact(html, name) {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) {
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  window.Quantum.skills.register({
    id: 'website', icon: '🌐', name: 'AI Homepage Builder',
    desc: 'Erstellt mit dem zentralen KI-Gateway eine komplette Homepage',
    usage: '/skill website Landingpage für ein Café im Neonstil',
    async run(input) {
      const brief = input.trim();
      if (!brief) return 'Beschreibe die Homepage: `/skill website Landingpage für ein Café im Neonstil`.';
      const result = await askPreferStream({
        system: 'You are a senior web designer and frontend engineer. Return only one complete standalone HTML document with embedded responsive CSS and JavaScript. No markdown fences, external scripts, trackers, network calls or placeholders. Use semantic HTML and accessible controls.',
        prompt: 'Build this production-quality homepage. Brief: ' + brief,
        temperature: 0.45,
      }, { stream: 14000, direct: 2500 });
      const html = cleanHtml(result.text);
      if (!/^<!doctype html>/i.test(html) || !/<\/html>\s*$/i.test(html)) throw new Error('Das Modell hat keine vollständige HTML-Seite geliefert. Bitte erneut versuchen.');
      openArtifact(html, 'quantum-homepage.html');
      return '🌐 **AI HOMEPAGE BUILDER**\nDie Homepage wurde mit `' + result.model + '` erstellt und in einem neuen Tab geöffnet.';
    },
  });

  window.Quantum.skills.register({
    id: 'coding', icon: '💻', name: 'AI Coding-Agent',
    desc: 'Plant und schreibt Code mit dem zentralen KI-Gateway',
    usage: '/skill coding Erstelle eine JavaScript-Todo-App',
    async run(input) {
      const task = input.trim();
      if (!task) return 'Welche Coding-Aufgabe soll ich lösen? `/skill coding <Aufgabe>`';
      const result = await askPreferStream({
        system: 'You are Quantum Coding Agent, a senior software engineer. Give a concise implementation plan, then complete production-ready code. State filenames. Never include secrets. Prefer simple secure solutions.',
        prompt: task,
        temperature: 0.25,
      }, { stream: 10000, direct: 2500 });
      return '💻 **AI CODING-AGENT** · `' + result.model + '`\n\n' + result.text;
    },
  });

  /* AutoGen-Stil-Team (Port des autogen_starter aus awesome-ai-apps):
     drei Agenten-Rollen arbeiten die Aufgabe nacheinander über das
     zentrale KI-Gateway ab — Planner zerlegt, Worker löst, Critic
     prüft und liefert die finale Fassung. */
  window.Quantum.skills.register({
    id: 'team', icon: '🤝', name: 'AutoGen Agent-Team',
    desc: 'Planner, Worker und Critic lösen Aufgaben gemeinsam',
    usage: '/skill team Businessplan für ein Neon-Café',
    async run(input) {
      const task = input.trim();
      if (!task) return 'Welche Aufgabe soll das Agent-Team lösen? `/skill team <Aufgabe>`';
      const plan = await askPreferStream({
        system: 'You are the PLANNER of a multi-agent team. Break the task into 3-5 concrete numbered steps. Answer in German, at most 120 words, do not solve the task yet.',
        prompt: task,
        temperature: 0.3,
      }, { stream: 1200, direct: 800 });
      const work = await askPreferStream({
        system: 'You are the WORKER of a multi-agent team. Follow the given plan step by step and deliver the complete, concrete result in German.',
        prompt: 'Aufgabe: ' + task + '\n\nPlan des Planners:\n' + plan.text,
        temperature: 0.4,
      }, { stream: 9000, direct: 2500 });
      const review = await askPreferStream({
        system: 'You are the CRITIC of a multi-agent team. Check the result for gaps and errors, then output only the final improved version in German — no meta commentary.',
        prompt: 'Aufgabe: ' + task + '\n\nErgebnis des Workers:\n' + work.text,
        temperature: 0.2,
      }, { stream: 9000, direct: 2500 });
      return [
        '🤝 **AUTOGEN AGENT-TEAM** · `' + (review.model || work.model || 'KI-Modell') + '`',
        '',
        '**🧭 Planner:**',
        plan.text.trim(),
        '',
        '**🛠 Worker → 🔎 Critic (finale Fassung):**',
        review.text.trim(),
      ].join('\n');
    },
  });
})();
