/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Kurs-Studio
   Skill "kurs": generiert komplette Online-Kurse (Module, Lektionen,
   Quizzes, Übungen, Bilder, Begleitmaterial) und exportiert sie als
   eigenständige HTML-, PDF- und Markdown-Datei.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  /* ── Reine Helfer ──────────────────────────────────────────── */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function cleanJson(text) {
    var raw = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    var start = raw.indexOf('{');
    var end = raw.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Die KI-Antwort enthielt kein gültiges JSON.');
    return JSON.parse(raw.slice(start, end + 1));
  }

  function slugify(title) {
    return String(title || 'kurs').toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-+|-+$/g, '') || 'kurs';
  }

  function str(value, max) { return String(value == null ? '' : value).slice(0, max); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function clampInt(n, lo, hi, dflt) {
    var v = parseInt(n, 10);
    if (isNaN(v)) v = dflt;
    return Math.max(lo, Math.min(hi, v));
  }

  function parseOutline(text, params) {
    params = params || {};
    var data = cleanJson(text);
    var module = arr(data.module || data.modules).slice(0, 12).map(function (m) {
      return {
        titel: str(m.titel || m.title, 160) || 'Modul',
        kurzbeschreibung: str(m.kurzbeschreibung || m.summary, 400),
        lektionen: arr(m.lektionen || m.lessons).slice(0, 12).map(function (l) {
          return {
            titel: str(l.titel || l.title, 160) || 'Lektion',
            lernziele: arr(l.lernziele || l.objectives).slice(0, 6).map(function (z) { return str(z, 200); }).filter(Boolean),
            inhalt: '', zusammenfassung: '', bild: '', bildPrompt: '',
            quiz: [], uebungen: [],
          };
        }),
      };
    });
    if (!module.length) throw new Error('Es wurde kein Lehrplan erzeugt.');
    return {
      titel: str(data.titel || data.title, 160) || str(params.thema, 160) || 'Kurs',
      untertitel: str(data.untertitel || data.subtitle, 200),
      beschreibung: str(data.beschreibung || data.description, 800),
      zielgruppe: str(params.zielgruppe, 160),
      niveau: str(params.niveau, 60),
      sprache: str(params.sprache, 40) || 'Deutsch',
      theme: str(params.theme, 20) || 'neon',
      cover: '',
      lehrplan: arr(data.lehrplan || data.syllabus).slice(0, 20).map(function (p) { return str(p, 200); }).filter(Boolean),
      glossar: [], ressourcen: [],
      module: module,
    };
  }

  function parseLesson(text) {
    var data = cleanJson(text);
    return {
      inhalt: str(data.inhalt || data.content, 8000),
      zusammenfassung: str(data.zusammenfassung || data.summary, 800),
      quiz: arr(data.quiz).map(function (q) {
        var optionen = arr(q.optionen || q.options).slice(0, 6).map(function (o) { return str(o, 300); }).filter(Boolean);
        var idx = parseInt(q.loesungIndex != null ? q.loesungIndex : q.answerIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= optionen.length) idx = 0;
        return { frage: str(q.frage || q.question, 400), optionen: optionen, loesungIndex: idx, erklaerung: str(q.erklaerung || q.explanation, 500) };
      }).filter(function (q) { return q.frage && q.optionen.length >= 2; }).slice(0, 8),
      uebungen: arr(data.uebungen || data.exercises).map(function (u) {
        return { aufgabe: str(u.aufgabe || u.task, 500), tipp: str(u.tipp || u.hint, 300), loesung: str(u.loesung || u.solution, 800) };
      }).filter(function (u) { return u.aufgabe; }).slice(0, 6),
    };
  }

  function parseExtras(text) {
    var data = cleanJson(text);
    return {
      glossar: arr(data.glossar || data.glossary).map(function (g) {
        return { begriff: str(g.begriff || g.term, 120), definition: str(g.definition, 500) };
      }).filter(function (g) { return g.begriff && g.definition; }).slice(0, 40),
      ressourcen: arr(data.ressourcen || data.resources).map(function (r) {
        return { label: str(r.label, 200), notiz: str(r.notiz || r.note, 300) };
      }).filter(function (r) { return r.label; }).slice(0, 30),
    };
  }

  function outlineSystemPrompt(params) {
    var sprache = (params && params.sprache) || 'Deutsch';
    return 'Du bist ein erfahrener Kurs-Designer. Antworte AUSSCHLIESSLICH mit gültigem JSON, '
      + 'ohne Text davor oder danach, ohne Code-Fences. Schreibe alle Inhalte auf ' + sprache + '. '
      + 'Schema: {"titel":string,"untertitel":string,"beschreibung":string,"lehrplan":[string],'
      + '"module":[{"titel":string,"kurzbeschreibung":string,"lektionen":[{"titel":string,"lernziele":[string]}]}]}';
  }

  function outlineUserPrompt(thema, quelle, params) {
    params = params || {};
    var lines = [];
    lines.push('Erstelle den Lehrplan (nur Gliederung, noch keine Lektionstexte) für einen Online-Kurs.');
    lines.push('Thema: ' + thema);
    if (params.zielgruppe) lines.push('Zielgruppe: ' + params.zielgruppe);
    if (params.niveau) lines.push('Niveau: ' + params.niveau);
    lines.push('Anzahl Module: ' + (params.moduleCount || 4));
    lines.push('Lektionen pro Modul: ca. ' + (params.lessonsPerModule || 3));
    lines.push('Jede Lektion braucht 2–4 konkrete Lernziele.');
    if (quelle) lines.push('\nStütze dich inhaltlich auf dieses Quellmaterial:\n' + String(quelle).slice(0, 6000));
    return lines.join('\n');
  }

  function lessonSystemPrompt(params) {
    params = params || {};
    var sprache = params.sprache || 'Deutsch';
    return 'Du bist ein didaktisch starker Kurs-Autor. Antworte AUSSCHLIESSLICH mit gültigem JSON, '
      + 'ohne Code-Fences. Schreibe auf ' + sprache + '. '
      + 'Schema: {"inhalt":string (ausführlicher Erklärtext in Markdown, 250–500 Wörter),'
      + '"zusammenfassung":string,'
      + (params.quiz ? '"quiz":[{"frage":string,"optionen":[string],"loesungIndex":number,"erklaerung":string}],' : '')
      + '"uebungen":[{"aufgabe":string,"tipp":string,"loesung":string}]}';
  }

  function lessonUserPrompt(ctx) {
    ctx = ctx || {};
    var lines = [];
    lines.push('Schreibe die vollständige Lektion für diesen Kurs.');
    lines.push('Kurs: ' + ctx.kursTitel);
    if (ctx.zielgruppe) lines.push('Zielgruppe: ' + ctx.zielgruppe);
    if (ctx.niveau) lines.push('Niveau: ' + ctx.niveau);
    lines.push('Modul: ' + ctx.modulTitel);
    lines.push('Lektion: ' + ctx.lektionTitel);
    if (ctx.lernziele && ctx.lernziele.length) lines.push('Lernziele: ' + ctx.lernziele.join('; '));
    if (ctx.nachbarn && ctx.nachbarn.length) lines.push('Andere Lektionen im Kurs (nicht wiederholen): ' + ctx.nachbarn.join('; '));
    if (ctx.quelle) lines.push('\nQuellmaterial:\n' + String(ctx.quelle).slice(0, 3000));
    lines.push('\nGib ' + (ctx.quiz ? '2–4 Quizfragen mit je 3–4 Optionen und ' : '') + '1–2 praktische Übungen aus.');
    return lines.join('\n');
  }

  function extrasSystemPrompt(params) {
    var sprache = (params && params.sprache) || 'Deutsch';
    return 'Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Code-Fences. Sprache: ' + sprache + '. '
      + 'Schema: {"glossar":[{"begriff":string,"definition":string}],"ressourcen":[{"label":string,"notiz":string}]}';
  }

  function extrasUserPrompt(course) {
    var titles = [];
    arr(course.module).forEach(function (m) { arr(m.lektionen).forEach(function (l) { titles.push(l.titel); }); });
    return 'Erzeuge Begleitmaterial für den Kurs "' + course.titel + '".\n'
      + 'Lektionen: ' + titles.join('; ') + '\n'
      + 'Gib 8–15 Glossarbegriffe und 4–8 weiterführende Ressourcen (allgemeine Empfehlungen, keine erfundenen URLs).';
  }

  function themeStyle(theme) {
    if (theme === 'light') return 'Klarer, heller, moderner Flat-Illustration-Stil. ';
    if (theme === 'business') return 'Edler, professioneller Business-Stil. ';
    return 'Neon-Cyberpunk-Stil, leuchtende Farben. ';
  }

  function coverPrompt(course) {
    return 'Cover-Illustration für einen Online-Kurs mit dem Titel "' + course.titel + '". '
      + themeStyle(course.theme) + 'Ohne Text im Bild.';
  }

  function lessonImagePrompt(course, mi, li) {
    var l = course.module[mi].lektionen[li];
    return 'Illustration zum Lernthema "' + l.titel + '" (Kurs: ' + course.titel + '). '
      + themeStyle(course.theme) + 'Ohne Text im Bild.';
  }

  function mdToHtml(md) {
    var esc = escapeHtml(md).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    var blocks = esc.split(/\n{2,}/);
    return blocks.map(function (block) {
      var lines = block.split('\n');
      if (lines.length && lines.every(function (ln) { return /^\s*[-*]\s+/.test(ln); })) {
        return '<ul>' + lines.map(function (ln) { return '<li>' + ln.replace(/^\s*[-*]\s+/, '') + '</li>'; }).join('') + '</ul>';
      }
      if (lines.length === 1 && /^#{1,4}\s+/.test(lines[0])) {
        var level = Math.min(lines[0].match(/^#+/)[0].length + 2, 6);
        return '<h' + level + '>' + lines[0].replace(/^#+\s+/, '') + '</h' + level + '>';
      }
      return '<p>' + lines.join('<br>') + '</p>';
    }).join('');
  }

  function buildMarkdown(course) {
    var out = [];
    out.push('# ' + course.titel);
    if (course.untertitel) out.push('*' + course.untertitel + '*');
    if (course.beschreibung) out.push('\n' + course.beschreibung);
    var meta = [];
    if (course.zielgruppe) meta.push('**Zielgruppe:** ' + course.zielgruppe);
    if (course.niveau) meta.push('**Niveau:** ' + course.niveau);
    if (meta.length) out.push('\n' + meta.join(' · '));
    if (course.lehrplan.length) {
      out.push('\n## Lehrplan');
      course.lehrplan.forEach(function (p) { out.push('- ' + p); });
    }
    if (course.cover) out.push('\n![Cover](' + course.cover + ')');
    course.module.forEach(function (m, mi) {
      out.push('\n## ' + (mi + 1) + '. ' + m.titel);
      if (m.kurzbeschreibung) out.push(m.kurzbeschreibung);
      m.lektionen.forEach(function (l, li) {
        out.push('\n### ' + (mi + 1) + '.' + (li + 1) + ' ' + l.titel);
        if (l.lernziele.length) {
          out.push('**Lernziele:**');
          l.lernziele.forEach(function (z) { out.push('- ' + z); });
        }
        if (l.bild) out.push('\n![' + l.titel + '](' + l.bild + ')');
        if (l.inhalt) out.push('\n' + l.inhalt);
        if (l.zusammenfassung) out.push('\n> **Zusammenfassung:** ' + l.zusammenfassung);
        if (l.quiz.length) {
          out.push('\n**Quiz:**');
          l.quiz.forEach(function (q, qi) {
            out.push((qi + 1) + '. ' + q.frage);
            q.optionen.forEach(function (o, oi) {
              out.push('   - ' + (oi === q.loesungIndex ? '**' + o + '** ✓' : o));
            });
            if (q.erklaerung) out.push('   > ' + q.erklaerung);
          });
        }
        if (l.uebungen.length) {
          out.push('\n**Übungen:**');
          l.uebungen.forEach(function (u, ui) {
            out.push((ui + 1) + '. ' + u.aufgabe);
            if (u.tipp) out.push('   - *Tipp:* ' + u.tipp);
            if (u.loesung) out.push('   - *Lösung:* ' + u.loesung);
          });
        }
      });
    });
    if (course.glossar.length) {
      out.push('\n## Glossar');
      course.glossar.forEach(function (g) { out.push('- **' + g.begriff + ':** ' + g.definition); });
    }
    if (course.ressourcen.length) {
      out.push('\n## Ressourcen');
      course.ressourcen.forEach(function (r) { out.push('- **' + r.label + '**' + (r.notiz ? ' — ' + r.notiz : '')); });
    }
    return out.join('\n');
  }

  var THEMES = {
    neon: { bg: '#080312', panel: '#160729', accent: '#B94DFF', accent2: '#00F5FF', text: '#FFFFFF', muted: '#CDBEE3' },
    business: { bg: '#111827', panel: '#1F2937', accent: '#D4A72C', accent2: '#F5D675', text: '#FFFFFF', muted: '#D1D5DB' },
    light: { bg: '#F5F7FB', panel: '#FFFFFF', accent: '#5B21B6', accent2: '#0891B2', text: '#111827', muted: '#4B5563' },
  };

  function quizHtml(quiz, idPrefix) {
    return quiz.map(function (q, qi) {
      var name = idPrefix + '-' + qi;
      var opts = q.optionen.map(function (o, oi) {
        return '<label class="qz__opt"><input type="radio" name="' + name + '" data-correct="' + (oi === q.loesungIndex ? '1' : '0') + '"> ' + escapeHtml(o) + '</label>';
      }).join('');
      return '<div class="qz"><p class="qz__q">' + escapeHtml(q.frage) + '</p>' + opts
        + '<button type="button" class="qz__check">Lösung anzeigen</button>'
        + (q.erklaerung ? '<p class="qz__exp" hidden>' + escapeHtml(q.erklaerung) + '</p>' : '') + '</div>';
    }).join('');
  }

  function standaloneCss(t) {
    return ':root{--bg:' + t.bg + ';--panel:' + t.panel + ';--accent:' + t.accent + ';--accent2:' + t.accent2 + ';--text:' + t.text + ';--muted:' + t.muted + '}'
      + '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.6}'
      + 'header.kh{padding:3rem 1.5rem;text-align:center;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}'
      + 'header.kh h1{margin:0;font-size:2.2rem}header.kh p{margin:.5rem 0 0;opacity:.9}'
      + '.wrap{display:flex;gap:2rem;max-width:1100px;margin:0 auto;padding:2rem 1.5rem;align-items:flex-start}'
      + 'nav.toc{position:sticky;top:1rem;flex:0 0 220px;background:var(--panel);border-radius:12px;padding:1rem}'
      + 'nav.toc a{color:var(--muted);text-decoration:none;display:block;padding:.25rem 0}nav.toc a:hover{color:var(--accent2)}'
      + 'main{flex:1;min-width:0}.mod{margin-bottom:2.5rem}.mod h2{color:var(--accent2);border-bottom:2px solid var(--accent);padding-bottom:.3rem}'
      + '.les{background:var(--panel);border-radius:12px;padding:1.25rem;margin:1rem 0}.les h3{margin-top:0}'
      + '.les__goals{color:var(--muted)}.les__img{width:100%;border-radius:10px;margin:.5rem 0}'
      + '.les__sum{border-left:3px solid var(--accent);padding-left:.75rem;color:var(--muted)}'
      + '.qz{background:rgba(255,255,255,.05);border-radius:10px;padding:.75rem;margin:.6rem 0}.qz__q{font-weight:bold;margin:.2rem 0}'
      + '.qz__opt{display:block;padding:.25rem .4rem;border-radius:6px;cursor:pointer}.qz__opt--correct{background:rgba(0,200,120,.35)}.qz__opt--wrong{background:rgba(220,60,60,.35)}'
      + '.qz__check{margin-top:.4rem;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:.35rem .8rem;cursor:pointer}'
      + '.qz__exp{color:var(--muted);margin:.4rem 0 0}details{margin:.4rem 0}summary{cursor:pointer;font-weight:bold}'
      + 'dl.gl dt{font-weight:bold;color:var(--accent2)}dl.gl dd{margin:0 0 .6rem}'
      + '@media(max-width:760px){.wrap{flex-direction:column}nav.toc{position:static;width:100%}}';
  }

  var STANDALONE_SCRIPT = '<scr' + 'ipt>document.querySelectorAll(".qz__check").forEach(function(b){b.addEventListener("click",function(){var qz=b.closest(".qz");qz.querySelectorAll(".qz__opt").forEach(function(o){var i=o.querySelector("input");if(i.getAttribute("data-correct")==="1")o.classList.add("qz__opt--correct");else if(i.checked)o.classList.add("qz__opt--wrong");});var e=qz.querySelector(".qz__exp");if(e)e.hidden=false;});});</scr' + 'ipt>';

  function buildStandaloneHtml(course) {
    var t = THEMES[course.theme] || THEMES.neon;
    var toc = '', body = '';
    if (course.lehrplan.length) {
      body += '<section class="mod"><h2>Lehrplan</h2><ul>' + course.lehrplan.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul></section>';
    }
    course.module.forEach(function (m, mi) {
      toc += '<a href="#m' + mi + '">' + (mi + 1) + '. ' + escapeHtml(m.titel) + '</a>';
      body += '<section class="mod" id="m' + mi + '"><h2>' + (mi + 1) + '. ' + escapeHtml(m.titel) + '</h2>';
      if (m.kurzbeschreibung) body += '<p class="mod__sum">' + escapeHtml(m.kurzbeschreibung) + '</p>';
      m.lektionen.forEach(function (l, li) {
        body += '<article class="les"><h3>' + (mi + 1) + '.' + (li + 1) + ' ' + escapeHtml(l.titel) + '</h3>';
        if (l.lernziele.length) body += '<ul class="les__goals">' + l.lernziele.map(function (z) { return '<li>' + escapeHtml(z) + '</li>'; }).join('') + '</ul>';
        if (l.bild) body += '<img class="les__img" src="' + l.bild + '" alt="' + escapeHtml(l.titel) + '">';
        if (l.inhalt) body += '<div class="les__body">' + mdToHtml(l.inhalt) + '</div>';
        if (l.zusammenfassung) body += '<p class="les__sum"><strong>Zusammenfassung:</strong> ' + escapeHtml(l.zusammenfassung) + '</p>';
        if (l.quiz.length) body += '<div class="les__quiz">' + quizHtml(l.quiz, 'q' + mi + '-' + li) + '</div>';
        if (l.uebungen.length) body += '<div class="les__ex"><h4>Übungen</h4>' + l.uebungen.map(function (u) {
          return '<details><summary>' + escapeHtml(u.aufgabe) + '</summary>' + (u.tipp ? '<p><em>Tipp:</em> ' + escapeHtml(u.tipp) + '</p>' : '') + (u.loesung ? '<p><strong>Lösung:</strong> ' + escapeHtml(u.loesung) + '</p>' : '') + '</details>';
        }).join('') + '</div>';
        body += '</article>';
      });
      body += '</section>';
    });
    if (course.glossar.length) {
      body += '<section class="mod"><h2>Glossar</h2><dl class="gl">' + course.glossar.map(function (g) {
        return '<dt>' + escapeHtml(g.begriff) + '</dt><dd>' + escapeHtml(g.definition) + '</dd>';
      }).join('') + '</dl></section>';
    }
    if (course.ressourcen.length) {
      body += '<section class="mod"><h2>Ressourcen</h2><ul>' + course.ressourcen.map(function (r) {
        return '<li><strong>' + escapeHtml(r.label) + '</strong>' + (r.notiz ? ' — ' + escapeHtml(r.notiz) : '') + '</li>';
      }).join('') + '</ul></section>';
    }
    var header = '<header class="kh">' + (course.cover ? '<img src="' + course.cover + '" alt="Cover" style="max-width:420px;width:100%;border-radius:12px;margin-bottom:1rem">' : '')
      + '<h1>' + escapeHtml(course.titel) + '</h1>' + (course.untertitel ? '<p>' + escapeHtml(course.untertitel) + '</p>' : '') + '</header>';
    return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
      + escapeHtml(course.titel) + '</title><style>' + standaloneCss(t) + '</style></head><body>'
      + header + '<div class="wrap"><nav class="toc">' + toc + '</nav><main>' + body + '</main></div>' + STANDALONE_SCRIPT + '</body></html>';
  }

  /* ── Öffentliche Schnittstelle (wächst über die weiteren Tasks) ── */
  window.Quantum.courseStudio = {
    escapeHtml: escapeHtml,
    cleanJson: cleanJson,
    slugify: slugify,
    parseOutline: parseOutline,
    parseLesson: parseLesson,
    parseExtras: parseExtras,
    outlineSystemPrompt: outlineSystemPrompt,
    outlineUserPrompt: outlineUserPrompt,
    lessonSystemPrompt: lessonSystemPrompt,
    lessonUserPrompt: lessonUserPrompt,
    extrasSystemPrompt: extrasSystemPrompt,
    extrasUserPrompt: extrasUserPrompt,
    themeStyle: themeStyle,
    coverPrompt: coverPrompt,
    lessonImagePrompt: lessonImagePrompt,
    mdToHtml: mdToHtml,
    buildMarkdown: buildMarkdown,
    quizHtml: quizHtml,
    buildStandaloneHtml: buildStandaloneHtml,
  };
})();
