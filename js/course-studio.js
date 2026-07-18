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

  function buildPrintHtml(course) {
    var body = '';
    if (course.lehrplan.length) {
      body += '<section class="pmod pmod--first"><h2>Lehrplan</h2><ul>' + course.lehrplan.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul></section>';
    }
    course.module.forEach(function (m, mi) {
      body += '<section class="pmod"><h2>' + (mi + 1) + '. ' + escapeHtml(m.titel) + '</h2>';
      if (m.kurzbeschreibung) body += '<p>' + escapeHtml(m.kurzbeschreibung) + '</p>';
      m.lektionen.forEach(function (l, li) {
        body += '<h3>' + (mi + 1) + '.' + (li + 1) + ' ' + escapeHtml(l.titel) + '</h3>';
        if (l.lernziele.length) body += '<ul>' + l.lernziele.map(function (z) { return '<li>' + escapeHtml(z) + '</li>'; }).join('') + '</ul>';
        if (l.bild) body += '<img src="' + l.bild + '" alt="' + escapeHtml(l.titel) + '">';
        if (l.inhalt) body += '<div>' + mdToHtml(l.inhalt) + '</div>';
        if (l.zusammenfassung) body += '<p class="psum"><strong>Zusammenfassung:</strong> ' + escapeHtml(l.zusammenfassung) + '</p>';
        l.quiz.forEach(function (q, qi) {
          body += '<p class="pq">' + (qi + 1) + '. ' + escapeHtml(q.frage) + '</p><ul>';
          q.optionen.forEach(function (o, oi) {
            body += '<li>' + (oi === q.loesungIndex ? '<strong>' + escapeHtml(o) + ' ✓</strong>' : escapeHtml(o)) + '</li>';
          });
          body += '</ul>';
          if (q.erklaerung) body += '<p class="pexp"><em>' + escapeHtml(q.erklaerung) + '</em></p>';
        });
        l.uebungen.forEach(function (u, ui) {
          body += '<p class="pex"><strong>Übung ' + (ui + 1) + ':</strong> ' + escapeHtml(u.aufgabe) + '</p>';
          if (u.loesung) body += '<p class="pexs"><em>Lösung:</em> ' + escapeHtml(u.loesung) + '</p>';
        });
      });
      body += '</section>';
    });
    if (course.glossar.length) {
      body += '<section class="pmod"><h2>Glossar</h2><dl>' + course.glossar.map(function (g) {
        return '<dt><strong>' + escapeHtml(g.begriff) + '</strong></dt><dd>' + escapeHtml(g.definition) + '</dd>';
      }).join('') + '</dl></section>';
    }
    if (course.ressourcen.length) {
      body += '<section class="pmod"><h2>Ressourcen</h2><ul>' + course.ressourcen.map(function (r) {
        return '<li><strong>' + escapeHtml(r.label) + '</strong>' + (r.notiz ? ' — ' + escapeHtml(r.notiz) : '') + '</li>';
      }).join('') + '</ul></section>';
    }
    var css = '@page{margin:2cm}*{box-sizing:border-box}body{font-family:Georgia,serif;color:#111;line-height:1.5;max-width:800px;margin:0 auto}'
      + 'h1{font-size:26pt;margin:0 0 .2rem}.lead{color:#555;margin:0 0 1.5rem}'
      + '.pmod h2{font-size:18pt;page-break-before:always;border-bottom:1px solid #999;padding-bottom:.2rem}.pmod--first h2{page-break-before:avoid}'
      + 'h3{font-size:14pt;margin-top:1rem}img{max-width:100%}.psum{border-left:3px solid #999;padding-left:.6rem;color:#333}'
      + '.pq{font-weight:bold;margin-bottom:.2rem}.pexp{color:#555;margin-top:0}.pex{margin-bottom:.1rem}.pexs{color:#333;margin-top:0}'
      + 'h3,.pq,.pex,img{page-break-inside:avoid}';
    return '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + escapeHtml(course.titel) + '</title><style>' + css + '</style></head><body>'
      + '<h1>' + escapeHtml(course.titel) + '</h1>' + (course.untertitel ? '<p class="lead">' + escapeHtml(course.untertitel) + '</p>' : '')
      + (course.beschreibung ? '<p>' + escapeHtml(course.beschreibung) + '</p>' : '') + body
      + '<scr' + 'ipt>onload=function(){setTimeout(function(){print()},300)}</scr' + 'ipt></body></html>';
  }

  function askAI(argsObj) {
    // Streaming bevorzugen (umgeht Netlifys 10-s-Limit), sonst klassisch.
    if (window.Quantum.ai && window.Quantum.ai.askStream) {
      return window.Quantum.ai.askStream(argsObj).catch(function () {
        return window.Quantum.ai.ask(argsObj);
      });
    }
    return window.Quantum.ai.ask(argsObj);
  }

  async function generateOutline(params) {
    params = params || {};
    var res = await askAI({
      system: outlineSystemPrompt(params),
      prompt: outlineUserPrompt(params.thema, params.quelle, params),
      temperature: 0.5, maxTokens: 4000,
    });
    return parseOutline(res.text, params);
  }

  function flatLessons(course) {
    var list = [];
    course.module.forEach(function (m, mi) { m.lektionen.forEach(function (l, li) { list.push({ mi: mi, li: li }); }); });
    return list;
  }

  async function elaborateOneLesson(course, pos, params) {
    var m = course.module[pos.mi];
    var l = m.lektionen[pos.li];
    var nachbarn = [];
    m.lektionen.forEach(function (x, i) { if (i !== pos.li) nachbarn.push(x.titel); });
    var res = await askAI({
      system: lessonSystemPrompt({ sprache: course.sprache, quiz: params.quiz }),
      prompt: lessonUserPrompt({
        kursTitel: course.titel, zielgruppe: course.zielgruppe, niveau: course.niveau, sprache: course.sprache,
        modulTitel: m.titel, lektionTitel: l.titel, lernziele: l.lernziele, nachbarn: nachbarn,
        quelle: params.quelle, quiz: params.quiz,
      }),
      temperature: 0.6, maxTokens: 3000,
    });
    var parsed = parseLesson(res.text);
    l.inhalt = parsed.inhalt; l.zusammenfassung = parsed.zusammenfassung;
    l.quiz = parsed.quiz; l.uebungen = parsed.uebungen;
  }

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  async function elaborateCourse(course, params, hooks) {
    params = params || {}; hooks = hooks || {};
    function cancelled() { return typeof hooks.shouldCancel === 'function' && hooks.shouldCancel(); }
    function progress(label, done, total) { if (typeof hooks.onProgress === 'function') hooks.onProgress(label, done, total); }
    var errors = [];
    var lessons = flatLessons(course);

    // Phase 2a: Lektionen
    for (var i = 0; i < lessons.length; i++) {
      if (cancelled()) return { errors: errors, cancelled: true };
      progress('Lektion ' + (i + 1) + '/' + lessons.length, i, lessons.length);
      try {
        await elaborateOneLesson(course, lessons[i], params);
      } catch (e1) {
        try {
          await elaborateOneLesson(course, lessons[i], params);
        } catch (e2) {
          var l = course.module[lessons[i].mi].lektionen[lessons[i].li];
          l.inhalt = l.inhalt || '_Diese Lektion konnte nicht automatisch erzeugt werden. Bitte manuell ergänzen._';
          errors.push(l.titel + ': ' + (e2.message || 'Fehler'));
        }
      }
    }

    // Phase 2b: Begleitmaterial
    if (cancelled()) return { errors: errors, cancelled: true };
    progress('Begleitmaterial …', lessons.length, lessons.length);
    try {
      var ex = await askAI({
        system: extrasSystemPrompt({ sprache: course.sprache }),
        prompt: extrasUserPrompt(course), temperature: 0.5, maxTokens: 2000,
      });
      var parsedEx = parseExtras(ex.text);
      course.glossar = parsedEx.glossar; course.ressourcen = parsedEx.ressourcen;
    } catch (e) {
      errors.push('Begleitmaterial: ' + (e.message || 'Fehler'));
    }

    // Phase 2c: Bilder (optional, sequenziell, mit Drosselung + Retry bei Limit)
    if (params.bilder && window.Quantum.imageStudio && window.Quantum.imageStudio.generate) {
      // Wiederholt eine Bild-Anfrage, wenn das Rate-Limit (429) greift: kurz
      // warten und erneut versuchen, statt das Bild sofort zu verwerfen.
      var retryWaits = [12000, 20000, 30000, 45000];
      var generateImage = async function (prompt, idx, total) {
        for (var attempt = 0; ; attempt++) {
          try {
            return await window.Quantum.imageStudio.generate({ prompt: prompt, aspectRatio: '16:9' });
          } catch (e) {
            var limited = e && (e.status === 429 || /zu viele|too many|rate|limit/i.test(e.message || ''));
            if (!limited || attempt >= retryWaits.length || cancelled()) throw e;
            progress('Bild ' + (idx + 1) + '/' + total + ' — kurz warten (Limit) …', idx, total);
            await sleep(retryWaits[attempt]);
          }
        }
      };

      var targets = [{ cover: true }].concat(lessons);
      for (var j = 0; j < targets.length; j++) {
        if (cancelled()) return { errors: errors, cancelled: true };
        progress('Bild ' + (j + 1) + '/' + targets.length, j, targets.length);
        try {
          var imgPrompt = targets[j].cover
            ? coverPrompt(course)
            : lessonImagePrompt(course, targets[j].mi, targets[j].li);
          var res = await generateImage(imgPrompt, j, targets.length);
          if (targets[j].cover) course.cover = res.image;
          else course.module[targets[j].mi].lektionen[targets[j].li].bild = res.image;
        } catch (e) {
          errors.push('Bild ' + (j + 1) + ': ' + (e.message || 'Fehler'));
        }
        // Bursts glätten: kleine Pause zwischen den Bildern schont das Limit.
        if (j < targets.length - 1) await sleep(1500);
      }
    }

    progress('Fertig', lessons.length, lessons.length);
    return { errors: errors, cancelled: false };
  }

  /* ── Modal-UI ──────────────────────────────────────────────── */

  var modal = null;
  var state = { course: null, params: null, cancel: false };

  function setStatus(text, kind) {
    var el = modal.querySelector('.tts-studio__status');
    el.textContent = text || '';
    el.className = 'tts-studio__status' + (kind ? ' tts-studio__status--' + kind : '');
  }

  function showPanel(name) {
    ['setup', 'review', 'result'].forEach(function (p) {
      var sec = modal.querySelector('[data-panel="' + p + '"]');
      if (sec) sec.hidden = (p !== name);
    });
  }

  function collectParams() {
    var q = function (sel) { return modal.querySelector(sel); };
    return {
      thema: q('#course-topic').value.trim(),
      quelle: q('#course-source').value.trim(),
      zielgruppe: q('#course-audience').value.trim(),
      niveau: q('#course-level').value,
      sprache: q('#course-lang').value.trim() || 'Deutsch',
      theme: q('#course-theme').value,
      moduleCount: parseInt(q('#course-modules').value, 10) || 4,
      lessonsPerModule: parseInt(q('#course-lessons').value, 10) || 3,
      quiz: q('#course-quiz').checked,
      bilder: q('#course-images').checked,
    };
  }

  function renderOutlineEditor() {
    var c = state.course;
    var html = '<input class="course-edit__title" id="course-edit-title" value="' + escapeHtml(c.titel) + '">';
    c.module.forEach(function (m, mi) {
      html += '<div class="course-mod" data-mi="' + mi + '"><input class="course-mod__title" data-mi="' + mi + '" value="' + escapeHtml(m.titel) + '">'
        + '<button type="button" class="course-x" data-act="del-mod" data-mi="' + mi + '" title="Modul löschen">✕</button><ul class="course-les">';
      m.lektionen.forEach(function (l, li) {
        html += '<li><input class="course-les__title" data-mi="' + mi + '" data-li="' + li + '" value="' + escapeHtml(l.titel) + '">'
          + '<button type="button" class="course-x" data-act="up" data-mi="' + mi + '" data-li="' + li + '" title="hoch">↑</button>'
          + '<button type="button" class="course-x" data-act="down" data-mi="' + mi + '" data-li="' + li + '" title="runter">↓</button>'
          + '<button type="button" class="course-x" data-act="del-les" data-mi="' + mi + '" data-li="' + li + '" title="Lektion löschen">✕</button></li>';
      });
      html += '</ul><button type="button" class="course-add" data-act="add-les" data-mi="' + mi + '">+ Lektion</button></div>';
    });
    html += '<button type="button" class="course-add" data-act="add-mod">+ Modul</button>';
    modal.querySelector('.course-outline').innerHTML = html;
  }

  function syncOutlineFromEditor() {
    var c = state.course;
    var t = modal.querySelector('#course-edit-title');
    if (t) c.titel = t.value.trim() || c.titel;
    modal.querySelectorAll('.course-mod__title').forEach(function (inp) {
      c.module[+inp.dataset.mi].titel = inp.value.trim() || 'Modul';
    });
    modal.querySelectorAll('.course-les__title').forEach(function (inp) {
      c.module[+inp.dataset.mi].lektionen[+inp.dataset.li].titel = inp.value.trim() || 'Lektion';
    });
  }

  function emptyLesson(titel) {
    return { titel: titel, lernziele: [], inhalt: '', zusammenfassung: '', bild: '', bildPrompt: '', quiz: [], uebungen: [] };
  }

  function onOutlineClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    syncOutlineFromEditor();
    var c = state.course, mi = +btn.dataset.mi, li = +btn.dataset.li, act = btn.dataset.act;
    if (act === 'add-mod') c.module.push({ titel: 'Neues Modul', kurzbeschreibung: '', lektionen: [emptyLesson('Neue Lektion')] });
    else if (act === 'del-mod') c.module.splice(mi, 1);
    else if (act === 'add-les') c.module[mi].lektionen.push(emptyLesson('Neue Lektion'));
    else if (act === 'del-les') c.module[mi].lektionen.splice(li, 1);
    else if (act === 'up' && li > 0) c.module[mi].lektionen.splice(li - 1, 0, c.module[mi].lektionen.splice(li, 1)[0]);
    else if (act === 'down' && li < c.module[mi].lektionen.length - 1) c.module[mi].lektionen.splice(li + 1, 0, c.module[mi].lektionen.splice(li, 1)[0]);
    if (!c.module.length) c.module.push({ titel: 'Modul', kurzbeschreibung: '', lektionen: [emptyLesson('Lektion')] });
    renderOutlineEditor();
  }

  async function onGenerateOutline() {
    var params = collectParams();
    if (!params.thema) { setStatus('Bitte zuerst ein Thema eingeben.', 'error'); return; }
    if (!window.Quantum.ai || !window.Quantum.ai.hasAccess || !window.Quantum.ai.hasAccess()) {
      // hasAccess ist optional; wenn nicht vorhanden, einfach weiter versuchen
    }
    state.params = params;
    var btn = modal.querySelector('.course-gen-outline');
    btn.disabled = true;
    setStatus('Lehrplan wird generiert …');
    try {
      state.course = await generateOutline(params);
      renderOutlineEditor();
      showPanel('review');
      setStatus('');
    } catch (e) {
      setStatus('⚠ ' + (e.message || 'Lehrplan-Generierung fehlgeschlagen.'), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function onElaborate() {
    syncOutlineFromEditor();
    state.cancel = false;
    var btn = modal.querySelector('.course-elaborate');
    var cancelBtn = modal.querySelector('.course-cancel');
    var bar = modal.querySelector('.course-progress__bar');
    var lbl = modal.querySelector('.course-progress__label');
    modal.querySelector('.course-progress').hidden = false;
    btn.disabled = true; cancelBtn.hidden = false;
    try {
      var result = await elaborateCourse(state.course, state.params, {
        onProgress: function (label, done, total) {
          lbl.textContent = label;
          bar.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
        },
        shouldCancel: function () { return state.cancel; },
      });
      if (result.cancelled) { setStatus('Abgebrochen. Bereits erzeugte Inhalte bleiben erhalten.', 'error'); }
      else if (result.errors.length) { setStatus('Fertig — mit ' + result.errors.length + ' Hinweis(en): ' + result.errors.slice(0, 3).join(' | '), 'error'); }
      renderPreview();
      showPanel('result');
    } catch (e) {
      setStatus('⚠ ' + (e.message || 'Ausarbeitung fehlgeschlagen.'), 'error');
    } finally {
      btn.disabled = false; cancelBtn.hidden = true;
      modal.querySelector('.course-progress').hidden = true;
    }
  }

  function renderPreview() {
    modal.querySelector('.course-preview').innerHTML = buildStandaloneHtml(state.course)
      .replace(/^[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*$/, '');
  }

  function downloadBlob(content, filename, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function onExportHtml() { downloadBlob(buildStandaloneHtml(state.course), slugify(state.course.titel) + '-kurs.html', 'text/html'); }
  function onExportMd() { downloadBlob(buildMarkdown(state.course), slugify(state.course.titel) + '-kurs.md', 'text/markdown'); }
  function onExportPdf() {
    var win = window.open('', '_blank');
    if (!win) { setStatus('Popup blockiert. Bitte Popups für den PDF-Export erlauben.', 'error'); return; }
    win.document.write(buildPrintHtml(state.course));
    win.document.close();
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'tts-studio course-studio';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="tts-studio__card course-studio__card">'
      + '<div class="tts-studio__head"><span class="tts-studio__title">🎓 KURS-STUDIO</span><button class="tts-studio__close" title="Schließen">✕</button></div>'
      // Panel 1: Setup
      + '<section data-panel="setup">'
      + '<label class="tts-studio__label" for="course-topic">Thema</label>'
      + '<textarea id="course-topic" class="tts-studio__text" rows="2" maxlength="600" placeholder="z. B. Excel für Einsteiger"></textarea>'
      + '<label class="tts-studio__label" for="course-source">Quellmaterial (optional)</label>'
      + '<textarea id="course-source" class="tts-studio__text" rows="3" maxlength="12000" placeholder="Eigene Texte hier einfügen …"></textarea>'
      + '<button type="button" class="course-import">📎 Aus angehängten Dateien übernehmen</button>'
      + '<div class="course-fields">'
      + '<label>Zielgruppe<input id="course-audience" class="tts-studio__input" placeholder="z. B. Büroangestellte"></label>'
      + '<label>Niveau<select id="course-level" class="tts-studio__input"><option>Einsteiger</option><option>Fortgeschritten</option><option>Profi</option></select></label>'
      + '<label>Sprache<input id="course-lang" class="tts-studio__input" value="Deutsch"></label>'
      + '<label>Design<select id="course-theme" class="tts-studio__input"><option value="neon">Quantum Neon</option><option value="business">Gold Business</option><option value="light">Clean Light</option></select></label>'
      + '<label>Module<input id="course-modules" class="tts-studio__input" type="number" min="1" max="12" value="4"></label>'
      + '<label>Lektionen/Modul<input id="course-lessons" class="tts-studio__input" type="number" min="1" max="10" value="3"></label>'
      + '</div>'
      + '<div class="course-checks"><label><input type="checkbox" id="course-quiz" checked> Quizzes &amp; Übungen</label>'
      + '<label><input type="checkbox" id="course-images"> Bilder generieren</label></div>'
      + '<button class="tts-studio__generate course-gen-outline">📋 LEHRPLAN GENERIEREN</button>'
      + '</section>'
      // Panel 2: Review
      + '<section data-panel="review" hidden>'
      + '<p class="course-hint">Prüfe und bearbeite die Struktur, dann arbeite den Kurs aus.</p>'
      + '<div class="course-outline"></div>'
      + '<div class="course-progress" hidden><div class="course-progress__track"><div class="course-progress__bar"></div></div><span class="course-progress__label"></span></div>'
      + '<div class="course-actions"><button class="tts-studio__generate course-elaborate">✍️ KURS AUSARBEITEN</button>'
      + '<button class="course-cancel" hidden>Abbrechen</button>'
      + '<button class="course-back" data-goto="setup">← Zurück</button></div>'
      + '</section>'
      // Panel 3: Result
      + '<section data-panel="result" hidden>'
      + '<div class="course-exports"><button class="course-exp-html">⬇ HTML-Kurs</button><button class="course-exp-pdf">⬇ PDF</button><button class="course-exp-md">⬇ Markdown</button>'
      + '<button class="course-back" data-goto="review">← Struktur</button></div>'
      + '<div class="course-preview"></div>'
      + '</section>'
      + '<div class="tts-studio__status" aria-live="polite"></div>'
      + '</div>';
    document.body.appendChild(modal);

    modal.querySelector('.tts-studio__close').onclick = close;
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    modal.querySelector('.course-gen-outline').onclick = onGenerateOutline;
    modal.querySelector('.course-outline').addEventListener('click', onOutlineClick);
    modal.querySelector('.course-elaborate').onclick = onElaborate;
    modal.querySelector('.course-cancel').onclick = function () { state.cancel = true; };
    modal.querySelector('.course-exp-html').onclick = onExportHtml;
    modal.querySelector('.course-exp-pdf').onclick = onExportPdf;
    modal.querySelector('.course-exp-md').onclick = onExportMd;
    modal.querySelector('.course-import').onclick = function () {
      var ctx = (window.Quantum.uploads && window.Quantum.uploads.getContext) ? window.Quantum.uploads.getContext() : '';
      if (!ctx) { setStatus('Keine Text-Anhänge gefunden. Hänge oben über 📎 eine Datei an.', 'error'); return; }
      var field = modal.querySelector('#course-source');
      field.value = (field.value ? field.value + '\n\n' : '') + ctx;
      setStatus('Angehängtes Material übernommen.', 'ok');
    };
    modal.querySelectorAll('.course-back').forEach(function (b) { b.onclick = function () { showPanel(b.dataset.goto); }; });
  }

  function open(thema) {
    if (!modal) buildModal();
    modal.hidden = false;
    showPanel('setup');
    if (thema) modal.querySelector('#course-topic').value = thema;
    modal.querySelector('#course-topic').focus();
  }

  function close() { if (modal) modal.hidden = true; }

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
    buildPrintHtml: buildPrintHtml,
    generateOutline: generateOutline,
    elaborateCourse: elaborateCourse,
    open: open,
    close: close,
  };

  if (window.Quantum.skills) window.Quantum.skills.register({
    id: 'kurs', icon: '🎓', name: 'Kurs-Studio',
    desc: 'Generiert komplette Online-Kurse (Module, Lektionen, Quizzes, Bilder) und exportiert HTML, PDF & Markdown',
    usage: '/skill kurs <thema>',
    run: function (input) {
      open((input || '').trim());
      return '🎓 **KURS-STUDIO** geöffnet. Gib dein Thema ein, generiere den Lehrplan, arbeite den Kurs aus und exportiere ihn als HTML, PDF oder Markdown.';
    },
  });
})();
