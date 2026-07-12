/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Dokument-Studio
   Erzeugt designte Dokumente direkt im Browser (HTML, druckbar
   als PDF über den Print-Dialog). Zwei Themes: premium & neon.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* Sehr kleine Markup-Konvertierung: # Überschrift, - Liste, Rest Absatz */
  function contentToHtml(text) {
    const lines = text.split(/\n|\\n/);
    const out = [];
    let list = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('- ')) {
        if (!list) { list = []; }
        list.push('<li>' + esc(line.slice(2)) + '</li>');
        continue;
      }
      if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; }
      if (!line) continue;
      if (line.startsWith('## ')) out.push('<h3>' + esc(line.slice(3)) + '</h3>');
      else if (line.startsWith('# ')) out.push('<h2>' + esc(line.slice(2)) + '</h2>');
      else out.push('<p>' + esc(line) + '</p>');
    }
    if (list) out.push('<ul>' + list.join('') + '</ul>');
    return out.join('\n');
  }

  const THEMES = {
    premium: {
      label: 'Premium (Gold/Schwarz)',
      fonts: 'family=Playfair+Display:wght@500;700&family=Manrope:wght@400;600',
      css: `
        body { font-family: 'Manrope', sans-serif; color: #1a1a1a; background: #f4f2ec; margin: 0; }
        .page { max-width: 800px; margin: 2rem auto; background: #fff; box-shadow: 0 8px 40px rgba(0,0,0,0.12); }
        .cover { background: #0a0a0a; color: #fff; padding: 4rem 3.5rem 3rem; position: relative; }
        .cover::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
          background: linear-gradient(90deg, #D4AF37, #F3E5AB, #D4AF37); }
        .cover .kicker { color: #D4AF37; font-size: 0.75rem; letter-spacing: 0.35em; text-transform: uppercase; margin: 0 0 1rem; }
        .cover h1 { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 2.6rem; line-height: 1.15; margin: 0; }
        .cover .date { margin-top: 1.6rem; color: #a1a1aa; font-size: 0.85rem; letter-spacing: 0.1em; }
        .body { padding: 3rem 3.5rem 3.5rem; line-height: 1.75; font-size: 1.02rem; }
        .body h2 { font-family: 'Playfair Display', serif; font-size: 1.6rem; margin: 2.2rem 0 0.7rem;
          padding-bottom: 0.35rem; border-bottom: 2px solid #D4AF37; }
        .body h3 { font-family: 'Playfair Display', serif; font-size: 1.2rem; margin: 1.6rem 0 0.4rem; color: #333; }
        .body ul { padding-left: 1.3rem; } .body li { margin: 0.35rem 0; }
        .body li::marker { color: #D4AF37; }
        .foot { padding: 1.2rem 3.5rem; border-top: 1px solid #e5e0d3; color: #8a8578;
          font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; display: flex; justify-content: space-between; }`,
    },
    neon: {
      label: 'Neon (Quantum-Look)',
      fonts: 'family=Orbitron:wght@700&family=Rajdhani:wght@400;600',
      css: `
        body { font-family: 'Rajdhani', sans-serif; color: #e8e6ff; background: #030014; margin: 0;
          print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .page { max-width: 800px; margin: 2rem auto; background: linear-gradient(160deg, #07021f, #0c032c);
          border: 1px solid rgba(0,245,255,0.35); box-shadow: 0 0 40px rgba(0,245,255,0.25); }
        .cover { padding: 4rem 3.5rem 3rem; border-bottom: 2px solid; border-image:
          linear-gradient(90deg, #00f5ff, #9d4dff, #ff2df7) 1; }
        .cover .kicker { color: #ff2df7; font-size: 0.75rem; letter-spacing: 0.35em; text-transform: uppercase;
          margin: 0 0 1rem; text-shadow: 0 0 10px rgba(255,45,247,0.7); }
        .cover h1 { font-family: 'Orbitron', sans-serif; font-size: 2.2rem; line-height: 1.2; margin: 0;
          color: #00f5ff; text-shadow: 0 0 14px rgba(0,245,255,0.7); }
        .cover .date { margin-top: 1.6rem; color: #9a93c9; font-size: 0.85rem; letter-spacing: 0.1em; }
        .body { padding: 3rem 3.5rem 3.5rem; line-height: 1.75; font-size: 1.05rem; }
        .body h2 { font-family: 'Orbitron', sans-serif; font-size: 1.35rem; margin: 2.2rem 0 0.7rem; color: #ff2df7;
          text-shadow: 0 0 12px rgba(255,45,247,0.6); }
        .body h3 { font-size: 1.15rem; margin: 1.6rem 0 0.4rem; color: #9d4dff; }
        .body ul { padding-left: 1.3rem; } .body li { margin: 0.35rem 0; }
        .body li::marker { color: #00f5ff; }
        .foot { padding: 1.2rem 3.5rem; border-top: 1px dashed rgba(157,77,255,0.4); color: #9a93c9;
          font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; display: flex; justify-content: space-between; }`,
    },
  };

  function buildDocument(theme, title, content) {
    const t = THEMES[theme];
    const today = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
    return [
      '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '<title>' + esc(title) + '</title>',
      '<link href="https://fonts.googleapis.com/css2?' + t.fonts + '&display=swap" rel="stylesheet">',
      '<style>',
      t.css,
      '@media print { body { background: #fff; } .page { margin: 0; box-shadow: none; max-width: none; } .no-print { display: none; } }',
      '.no-print { position: fixed; top: 1rem; right: 1rem; } .no-print button { font: inherit; padding: 0.5rem 1rem; cursor: pointer; }',
      '</style></head><body>',
      '<div class="no-print"><button onclick="window.print()">🖨 Drucken / Als PDF speichern</button></div>',
      '<div class="page">',
      '<header class="cover"><p class="kicker">Erstellt mit Quantum ⚛</p>',
      '<h1>' + esc(title) + '</h1>',
      '<p class="date">' + today + '</p></header>',
      '<main class="body">' + contentToHtml(content) + '</main>',
      '<footer class="foot"><span>' + esc(title) + '</span><span>Quantum Dokument-Studio</span></footer>',
      '</div></body></html>',
    ].join('\n');
  }

  /* Öffnet das Dokument in neuem Tab; falls der Popup-Blocker greift
     (z. B. bei Automationen), wird stattdessen ein Download ausgelöst */
  function deliver(html, title) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.download = title.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-+|-+$/g, '') + '.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return 'download';
    }
    return 'tab';
  }

  window.Quantum.skills.register({
    id: 'dokument',
    icon: '📄',
    name: 'Dokument-Studio',
    desc: 'Erstellt designte Dokumente (Premium/Neon)',
    usage: '/skill dokument premium Titel | Inhalt (# Kapitel, - Punkte)',
    run(input) {
      let text = input.trim();
      let theme = 'premium';
      const m = text.match(/^(premium|neon)\s+/i);
      if (m) { theme = m[1].toLowerCase(); text = text.slice(m[0].length); }
      if (!text) {
        return [
          '📄 DOKUMENT-STUDIO',
          'So geht’s: `/skill dokument <theme> <Titel> | <Inhalt>`',
          'Themes: `premium` (Gold/Schwarz) oder `neon` (Quantum-Look)',
          'Im Inhalt: `# Kapitel`, `## Abschnitt`, `- Aufzählung`, sonst Absätze.',
          'Beispiel: `/skill dokument neon Sprint-Report | # Ziele\\n- Chat fertig\\n- Skills live`',
        ].join('\n');
      }
      const sep = text.indexOf('|');
      const title = (sep > -1 ? text.slice(0, sep) : text).trim() || 'Dokument';
      const content = sep > -1 ? text.slice(sep + 1).trim() : 'Inhalt folgt.';
      const how = deliver(buildDocument(theme, title, content), title);
      return how === 'tab'
        ? '📄 Dokument **' + title + '** (' + THEMES[theme].label + ') ist in einem neuen Tab geöffnet — dort kannst du es drucken oder als PDF speichern.'
        : '📄 Dokument **' + title + '** (' + THEMES[theme].label + ') wurde als Datei heruntergeladen (Popup war blockiert).';
    },
  });
})();
