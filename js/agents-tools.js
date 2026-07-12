/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Generator-Agenten (lokal, ohne API)
   newsletter: Newsletter-Entwurf aus Thema + Stichpunkten
   social:     Post-Entwürfe für LinkedIn/Instagram/X
   jobsearch:  Jobsuche-Links + Bewerbungs-Checkliste
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  /* ── Newsletter-Generator ──────────────────────────────────── */

  window.Quantum.skills.register({
    id: 'newsletter', icon: '📧', name: 'Newsletter-Generator',
    desc: 'Baut einen Newsletter-Entwurf',
    usage: '/skill newsletter Thema | Punkt 1; Punkt 2; Punkt 3',
    run(input) {
      const raw = input.trim();
      if (!raw) return 'So geht’s: `/skill newsletter KI-Trends | Neues Modell; Tool-Tipp; Event`';
      const sep = raw.indexOf('|');
      const topic = (sep > -1 ? raw.slice(0, sep) : raw).trim();
      const points = sep > -1
        ? raw.slice(sep + 1).split(';').map((s) => s.trim()).filter(Boolean)
        : [];
      const sections = points.length
        ? points.map((p, i) => '**' + (i + 1) + '. ' + p + '**\nKurzer Absatz dazu: Warum ist das relevant, was ist der Nutzen für die Leser, was ist der nächste Schritt?')
        : ['**1. Hauptthema**\nKernaussage zu „' + topic + '“ in 2–3 Sätzen.', '**2. Praxis-Tipp**\nEin sofort umsetzbarer Tipp.', '**3. Ausblick**\nWas kommt als Nächstes?'];
      return [
        '📧 **NEWSLETTER-ENTWURF: ' + topic.toUpperCase() + '**',
        '',
        '**Betreff-Ideen:**',
        '· ' + topic + ': Das musst du diese Woche wissen',
        '· 3 Dinge über ' + topic + ', die kaum jemand nutzt',
        '· Kurz & knapp: ' + topic + ' im Überblick',
        '',
        '**Intro:**\nHey! Heute geht es um ' + topic + ' — hier die wichtigsten Punkte in 2 Minuten Lesezeit.',
        '',
        sections.join('\n\n'),
        '',
        '**CTA:**\nAntworte einfach auf diese Mail, wenn du Fragen hast — oder leite sie an jemanden weiter, dem das hilft.',
        '',
        '💡 Tipp: Mit `/skill dokument premium ' + topic + ' | …` machst du daraus ein designtes Dokument.',
      ].join('\n');
    },
  });

  /* ── Social-Media-Agent ────────────────────────────────────── */

  window.Quantum.skills.register({
    id: 'social', icon: '📱', name: 'Social-Media-Agent',
    desc: 'Post-Entwürfe für LinkedIn, Instagram, X',
    usage: '/skill social Produktlaunch',
    run(input) {
      const topic = input.trim();
      if (!topic) return 'Wozu sollen die Posts sein? Beispiel: `/skill social Produktlaunch`';
      const tag = topic.replace(/[^\wäöüß]+/gi, '');
      return [
        '📱 **SOCIAL-MEDIA-PAKET: ' + topic.toUpperCase() + '**',
        '',
        '**LinkedIn (professionell):**',
        'Die meisten unterschätzen ' + topic + '.\n\nHier sind 3 Learnings aus der Praxis:\n1. …\n2. …\n3. …\n\nWelche Erfahrung hast du damit gemacht? 👇',
        '',
        '**Instagram (nahbar):**',
        '✨ ' + topic + ' — endlich verständlich erklärt!\nSwipe durch für die wichtigsten Punkte 👉\n.\n#' + tag + ' #tipps #business #lernen',
        '',
        '**X/Twitter (knackig):**',
        topic + ' in einem Satz:\n[Kernaussage].\n\nMehr dazu im Thread 🧵👇',
        '',
        '💡 Poste zu unterschiedlichen Zeiten und miss, was funktioniert — Quantum kann dich mit einer Automation täglich erinnern.',
      ].join('\n');
    },
  });

  /* ── JobSearch-Agent ───────────────────────────────────────── */

  window.Quantum.skills.register({
    id: 'jobsearch', icon: '💼', name: 'JobSearch-Agent',
    desc: 'Jobsuche-Links + Bewerbungsplan',
    usage: '/skill jobsearch Frontend Developer in Berlin',
    run(input) {
      const raw = input.trim();
      if (!raw) return 'Wonach suchst du? Beispiel: `/skill jobsearch Frontend Developer in Berlin`';
      const m = raw.match(/^(.*?)\s+in\s+(.+)$/i);
      const role = (m ? m[1] : raw).trim();
      const city = m ? m[2].trim() : '';
      const q = encodeURIComponent(role);
      const l = encodeURIComponent(city);
      return [
        '💼 **JOBSUCHE: ' + role.toUpperCase() + (city ? ' — ' + city.toUpperCase() : '') + '**',
        '',
        '**Direkt suchen:**',
        '· LinkedIn: https://www.linkedin.com/jobs/search/?keywords=' + q + (city ? '&location=' + l : ''),
        '· Indeed: https://de.indeed.com/jobs?q=' + q + (city ? '&l=' + l : ''),
        '· StepStone: https://www.stepstone.de/jobs/' + q + (city ? '/in-' + l : ''),
        '· XING: https://www.xing.com/jobs/search?keywords=' + q + (city ? '&location=' + l : ''),
        '',
        '**Dein 5-Schritte-Plan:**',
        '1. Profil schärfen: Titel + 3 messbare Erfolge in den Lebenslauf',
        '2. 10 passende Stellen speichern, 3 davon heute anschreiben',
        '3. Anschreiben pro Firma individualisieren (1 konkreter Bezug reicht)',
        '4. Follow-up nach 7 Tagen, freundlich und kurz',
        '5. Interviews üben: 3 Stories nach dem STAR-Prinzip vorbereiten',
        '',
        '💡 Lass dich täglich erinnern: Automation „Bewerbungs-Sprint“ → täglich 09:00 → Nachricht.',
      ].join('\n');
    },
  });
})();
