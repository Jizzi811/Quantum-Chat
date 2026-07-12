window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  function cleanHtml(text) {
    const match = String(text).match(/```(?:html)?\s*([\s\S]*?)```/i);
    return (match ? match[1] : text).trim();
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
    desc: 'Erstellt mit OpenRouter eine komplette Homepage',
    usage: '/skill website Landingpage für ein Café im Neonstil',
    async run(input) {
      const brief = input.trim();
      if (!brief) return 'Beschreibe die Homepage: `/skill website Landingpage für ein Café im Neonstil`.';
      const result = await window.Quantum.ai.ask({
        system: 'You are a senior web designer and frontend engineer. Return only one complete standalone HTML document with embedded responsive CSS and JavaScript. No markdown fences, external scripts, trackers, network calls or placeholders. Use semantic HTML and accessible controls.',
        prompt: 'Build this production-quality homepage. Brief: ' + brief,
        temperature: 0.45,
        maxTokens: 9000,
      });
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
      const result = await window.Quantum.ai.ask({
        system: 'You are Quantum Coding Agent, a senior software engineer. Give a concise implementation plan, then complete production-ready code. State filenames. Never include secrets. Prefer simple secure solutions.',
        prompt: task,
        temperature: 0.25,
        maxTokens: 8000,
      });
      return '💻 **AI CODING-AGENT** · `' + result.model + '`\n\n' + result.text;
    },
  });
})();
