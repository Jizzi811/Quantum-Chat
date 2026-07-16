/* QUANTUM — kostenloses In-App Präsentations-Studio */
window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const THEMES = {
    neon: { bg: '080312', panel: '160729', accent: 'B94DFF', accent2: '00F5FF', text: 'FFFFFF', muted: 'CDBEE3' },
    business: { bg: '111827', panel: '1F2937', accent: 'D4A72C', accent2: 'F5D675', text: 'FFFFFF', muted: 'D1D5DB' },
    light: { bg: 'F5F7FB', panel: 'FFFFFF', accent: '5B21B6', accent2: '0891B2', text: '111827', muted: '4B5563' },
  };
  let modal = null;
  let slides = [];
  let current = 0;
  let brandLogo = '';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function cleanJson(text) {
    const raw = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = raw.indexOf('['); const end = raw.lastIndexOf(']');
    if (start < 0 || end < start) throw new Error('Die KI-Antwort enthielt kein gültiges Foliendeck.');
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed) || !parsed.length) throw new Error('Es wurden keine Folien erzeugt.');
    return parsed.slice(0, 20).map(function (s, i) {
      return {
        title: String(s.title || ('Folie ' + (i + 1))).slice(0, 120),
        subtitle: String(s.subtitle || '').slice(0, 180),
        bullets: (Array.isArray(s.bullets) ? s.bullets : []).slice(0, 6).map(function (b) { return String(b).slice(0, 220); }),
        note: String(s.note || '').slice(0, 500),
      };
    });
  }

  function fallbackDeck(topic, count) {
    const names = ['Warum dieses Thema zählt', 'Ausgangslage', 'Die Kernidee', 'So funktioniert es', 'Chancen und Nutzen', 'Konkreter Fahrplan', 'Nächste Schritte'];
    return Array.from({ length: count }, function (_, i) {
      if (i === 0) return { title: topic, subtitle: 'Eine Präsentation erstellt mit QUANTUM', bullets: [], note: '' };
      if (i === count - 1) return { title: 'Nächste Schritte', subtitle: '', bullets: ['Prioritäten festlegen', 'Verantwortlichkeiten klären', 'Ersten Meilenstein starten'], note: '' };
      return { title: names[Math.min(i, names.length - 2)], subtitle: '', bullets: ['Wichtigster Aspekt zu ' + topic, 'Konkretes Beispiel oder Beleg ergänzen', 'Kernaussage für das Publikum'], note: '' };
    });
  }

  function themeName() { return modal.querySelector('#pres-theme').value; }
  function theme() {
    if (themeName() !== 'custom') return THEMES[themeName()] || THEMES.neon;
    return { bg: modal.querySelector('#pres-bg').value.slice(1), panel: '', accent: modal.querySelector('#pres-accent').value.slice(1), accent2: modal.querySelector('#pres-accent2').value.slice(1), text: modal.querySelector('#pres-text').value.slice(1), muted: modal.querySelector('#pres-text').value.slice(1), font: modal.querySelector('#pres-font').value };
  }

  function slideMarkup(slide, index) {
    const bullets = slide.bullets.map(function (b) { return '<li>' + escapeHtml(b) + '</li>'; }).join('');
    const t = theme();
    const style = themeName() === 'custom' ? '--pres-bg:#' + t.bg + ';--pres-accent:#' + t.accent + ';--pres-accent2:#' + t.accent2 + ';--pres-text:#' + t.text + ';--pres-font:' + t.font : '';
    return '<article class="presentation-slide presentation-slide--' + themeName() + '" style="' + style + '">' +
      '<div class="presentation-slide__glow"></div>' +
      (themeName() === 'custom' && brandLogo ? '<img class="presentation-slide__logo" src="' + brandLogo + '" alt="Logo">' : '<span class="presentation-slide__brand">QUANTUM · NADJ.AI</span>') +
      '<div class="presentation-slide__body"><p class="presentation-slide__kicker">SLIDE ' + String(index + 1).padStart(2, '0') + '</p>' +
      '<h1>' + escapeHtml(slide.title) + '</h1>' +
      (slide.subtitle ? '<h2>' + escapeHtml(slide.subtitle) + '</h2>' : '') +
      (bullets ? '<ul>' + bullets + '</ul>' : '') + '</div>' +
      '<span class="presentation-slide__number">' + (index + 1) + ' / ' + slides.length + '</span></article>';
  }

  function render() {
    const result = modal.querySelector('.presentation-studio__result');
    result.hidden = !slides.length;
    if (!slides.length) return;
    current = Math.max(0, Math.min(current, slides.length - 1));
    modal.querySelector('.presentation-studio__preview').innerHTML = slideMarkup(slides[current], current);
    modal.querySelector('.presentation-studio__position').textContent = (current + 1) + ' / ' + slides.length;
    modal.querySelector('.presentation-studio__prev').disabled = current === 0;
    modal.querySelector('.presentation-studio__next').disabled = current === slides.length - 1;
  }

  function setStatus(text, kind) {
    const el = modal.querySelector('.presentation-studio__status');
    el.textContent = text;
    el.className = 'presentation-studio__status' + (kind ? ' presentation-studio__status--' + kind : '');
  }

  async function generate() {
    const topic = modal.querySelector('#pres-topic').value.trim();
    const count = Number(modal.querySelector('#pres-count').value) || 8;
    const audience = modal.querySelector('#pres-audience').value.trim() || 'allgemeines Publikum';
    if (!topic) { setStatus('Bitte gib zuerst ein Thema ein.', 'error'); return; }
    const btn = modal.querySelector('.presentation-studio__generate');
    btn.disabled = true; setStatus('Quantum strukturiert dein Foliendeck …');
    try {
      if (!window.Quantum.ai || typeof window.Quantum.ai.ask !== 'function') throw new Error('KI-Gateway nicht verfügbar');
      const response = await window.Quantum.ai.ask({
        system: 'Du bist ein erfahrener Präsentationsdesigner. Antworte ausschließlich mit einem JSON-Array, ohne Markdown. Jedes Objekt: {"title":"...","subtitle":"...","bullets":["..."],"note":"..."}. Klare Dramaturgie, wenig Text, konkrete Aussagen. Deutsch.',
        prompt: 'Erstelle exakt ' + count + ' Folien zum Thema: ' + topic + '. Zielgruppe: ' + audience + '. Die erste Folie ist eine Titelfolie, die letzte enthält nächste Schritte.',
        temperature: 0.55, maxTokens: 3500,
      });
      slides = cleanJson(response.text || response.content || '');
      current = 0; render(); setStatus(slides.length + ' Folien erstellt. Du kannst jetzt blättern und exportieren.', 'ok');
    } catch (error) {
      slides = fallbackDeck(topic, count); current = 0; render();
      setStatus('KI war nicht erreichbar – ein bearbeitbares Grunddeck wurde erstellt. (' + error.message + ')', 'error');
    } finally { btn.disabled = false; }
  }

  function exportPdf() {
    if (!slides.length) return;
    const win = window.open('', '_blank');
    if (!win) { setStatus('Popup blockiert. Erlaube Popups für den PDF-Export.', 'error'); return; }
    const deck = slides.map(slideMarkup).join('');
    win.document.write('<!doctype html><html><head><title>Quantum Präsentation</title><style>' +
      '@page{size:13.333in 7.5in;margin:0}*{box-sizing:border-box}body{margin:0;background:#111;font-family:Arial,sans-serif}.presentation-slide{width:13.333in;height:7.5in;page-break-after:always;position:relative;overflow:hidden;padding:.65in .8in;color:#fff;background:#080312}.presentation-slide--business{background:#111827}.presentation-slide--light{background:#f5f7fb;color:#111827}.presentation-slide__brand,.presentation-slide__number{position:absolute;font-size:11pt;letter-spacing:2px;opacity:.65}.presentation-slide__brand{top:.4in;right:.6in}.presentation-slide__number{right:.6in;bottom:.35in}.presentation-slide__body{position:relative;top:1.15in;max-width:10.8in}.presentation-slide__kicker{color:#00eaff;letter-spacing:4px;font-weight:bold}.presentation-slide--business .presentation-slide__kicker{color:#f5d675}.presentation-slide--light .presentation-slide__kicker{color:#5b21b6}h1{font-size:38pt;margin:.12in 0 .18in}h2{font-size:21pt;font-weight:normal;opacity:.8;margin:0 0 .35in}ul{font-size:21pt;line-height:1.45;padding-left:.35in}li{margin:.12in 0}'+
      '</style></head><body>' + deck + '<script>onload=function(){setTimeout(function(){print()},250)}<\/script></body></html>');
    win.document.close(); setStatus('Druckdialog geöffnet – dort „Als PDF speichern“ wählen.', 'ok');
  }

  async function exportPptx() {
    if (!slides.length) return;
    if (typeof window.PptxGenJS !== 'function') { setStatus('PPTX-Modul konnte nicht geladen werden. Bitte Internetverbindung prüfen.', 'error'); return; }
    const colors = theme(); const font = colors.font || 'Arial'; const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'QUANTUM by NADJ.AI'; pptx.subject = modal.querySelector('#pres-topic').value;
    slides.forEach(function (item, index) {
      const slide = pptx.addSlide(); slide.background = { color: colors.bg };
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: colors.accent }, line: { color: colors.accent } });
      if (themeName() === 'custom' && brandLogo) slide.addImage({ data: brandLogo, x: 10.8, y: 0.2, w: 1.7, h: 0.65 });
      else slide.addText('QUANTUM · NADJ.AI', { x: 10.3, y: 0.28, w: 2.4, h: 0.25, fontFace: font, fontSize: 9, color: colors.muted, align: 'right', charSpacing: 1.4, margin: 0 });
      slide.addText('SLIDE ' + String(index + 1).padStart(2, '0'), { x: 0.8, y: 1.0, w: 2, h: 0.3, fontFace: 'Arial', bold: true, fontSize: 11, color: colors.accent2, charSpacing: 2, margin: 0 });
      slide.addText(item.title, { x: 0.8, y: 1.4, w: 11.2, h: 1.0, fontFace: 'Arial', bold: true, fontSize: index === 0 ? 34 : 28, color: colors.text, breakLine: false, margin: 0, valign: 'mid', fit: 'shrink' });
      if (item.subtitle) slide.addText(item.subtitle, { x: 0.82, y: 2.5, w: 10.8, h: 0.55, fontFace: 'Arial', fontSize: 17, color: colors.muted, margin: 0, fit: 'shrink' });
      if (item.bullets.length) slide.addText(item.bullets.map(function (b) { return { text: b, options: { bullet: { indent: 18 }, breakLine: true } }; }), { x: 0.9, y: 3.15, w: 10.9, h: 3.25, fontFace: 'Arial', fontSize: 20, color: colors.text, breakLine: true, paraSpaceAfterPt: 14, valign: 'top', margin: 0.05, fit: 'shrink' });
      slide.addText((index + 1) + ' / ' + slides.length, { x: 11.5, y: 6.92, w: 1.1, h: 0.2, fontFace: 'Arial', fontSize: 9, color: colors.muted, align: 'right', margin: 0 });
      if (item.note && slide.addNotes) slide.addNotes(item.note);
    });
    try { await pptx.writeFile({ fileName: 'quantum-praesentation.pptx' }); setStatus('PPTX wurde erstellt und heruntergeladen.', 'ok'); }
    catch (error) { setStatus('PPTX-Export fehlgeschlagen: ' + error.message, 'error'); }
  }

  function saveBranding() {
    try { localStorage.setItem('quantum.presentation.branding', JSON.stringify({ colors: theme(), logo: brandLogo })); setStatus('Eigenes Design wurde in diesem Browser gespeichert.', 'ok'); }
    catch (_) { setStatus('Design konnte nicht gespeichert werden. Das Logo ist möglicherweise zu groß.', 'error'); }
  }

  function loadBranding() {
    try {
      const data = JSON.parse(localStorage.getItem('quantum.presentation.branding') || 'null'); if (!data) return;
      modal.querySelector('#pres-bg').value = '#' + data.colors.bg; modal.querySelector('#pres-accent').value = '#' + data.colors.accent; modal.querySelector('#pres-accent2').value = '#' + data.colors.accent2; modal.querySelector('#pres-text').value = '#' + data.colors.text; modal.querySelector('#pres-font').value = data.colors.font || 'Arial'; brandLogo = data.logo || '';
    } catch (_) { /* ungültigen alten Speicherstand ignorieren */ }
  }

  function buildModal() {
    modal = document.createElement('div'); modal.className = 'tts-studio presentation-studio'; modal.hidden = true;
    modal.innerHTML = '<div class="tts-studio__card presentation-studio__card"><div class="tts-studio__head"><span class="tts-studio__title">📊 PRÄSENTATIONS-STUDIO</span><button class="tts-studio__close" title="Schließen">✕</button></div>' +
      '<div class="presentation-studio__form"><label>Thema<textarea id="pres-topic" class="tts-studio__text" rows="2" placeholder="z. B. BrandMind – das KI-Betriebssystem für Marken"></textarea></label>' +
      '<div class="presentation-studio__fields"><label>Zielgruppe<input id="pres-audience" class="tts-studio__input" placeholder="z. B. Investoren"></label><label>Folien<input id="pres-count" class="tts-studio__input" type="number" min="3" max="20" value="8"></label><label>Design<select id="pres-theme" class="tts-studio__input"><option value="neon">Quantum Neon</option><option value="business">Gold Business</option><option value="light">Clean Light</option><option value="custom">Eigenes Design</option></select></label></div>' +
      '<details class="presentation-studio__branding"><summary>🎨 Eigenes Design erstellen</summary><div class="presentation-studio__colors"><label>Hintergrund<input id="pres-bg" type="color" value="#111827"></label><label>Akzent<input id="pres-accent" type="color" value="#d4a72c"></label><label>Zweitfarbe<input id="pres-accent2" type="color" value="#f5d675"></label><label>Text<input id="pres-text" type="color" value="#ffffff"></label></div><div class="presentation-studio__fields"><label>Schrift<select id="pres-font" class="tts-studio__input"><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option><option>Times New Roman</option><option>Courier New</option></select></label><label>Eigenes Logo<input id="pres-logo" type="file" accept="image/png,image/jpeg,image/svg+xml"></label><button type="button" class="presentation-studio__save-brand">Design speichern</button></div><small>Das Design bleibt in diesem Browser gespeichert. Logo maximal 1 MB.</small></details>' +
      '<button class="tts-studio__generate presentation-studio__generate">⚡ DECK GENERIEREN</button><div class="presentation-studio__status" aria-live="polite"></div></div>' +
      '<section class="presentation-studio__result" hidden><div class="presentation-studio__preview"></div><div class="presentation-studio__nav"><button class="presentation-studio__prev">← Zurück</button><span class="presentation-studio__position"></span><button class="presentation-studio__next">Weiter →</button></div><div class="presentation-studio__exports"><button class="presentation-studio__pdf">⬇ PDF</button><button class="presentation-studio__pptx">⬇ PPTX (editierbar)</button></div></section></div>';
    document.body.appendChild(modal);
    modal.querySelector('.tts-studio__close').onclick = close;
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    modal.querySelector('.presentation-studio__generate').onclick = generate;
    modal.querySelector('.presentation-studio__prev').onclick = function () { current--; render(); };
    modal.querySelector('.presentation-studio__next').onclick = function () { current++; render(); };
    modal.querySelector('.presentation-studio__pdf').onclick = exportPdf;
    modal.querySelector('.presentation-studio__pptx').onclick = exportPptx;
    modal.querySelector('#pres-theme').onchange = render;
    ['pres-bg', 'pres-accent', 'pres-accent2', 'pres-text', 'pres-font'].forEach(function (id) { modal.querySelector('#' + id).oninput = function () { modal.querySelector('#pres-theme').value = 'custom'; render(); }; });
    modal.querySelector('#pres-logo').onchange = function () { const file = this.files && this.files[0]; if (!file) return; if (file.size > 1024 * 1024) { setStatus('Das Logo darf maximal 1 MB groß sein.', 'error'); return; } const reader = new FileReader(); reader.onload = function () { brandLogo = reader.result; modal.querySelector('#pres-theme').value = 'custom'; render(); }; reader.readAsDataURL(file); };
    modal.querySelector('.presentation-studio__save-brand').onclick = saveBranding;
    loadBranding();
  }

  function open(topic) { if (!modal) buildModal(); modal.hidden = false; if (topic) modal.querySelector('#pres-topic').value = topic; modal.querySelector('#pres-topic').focus(); }
  function close() { if (modal) modal.hidden = true; }

  window.Quantum.presentation = { open: open, close: close, parse: cleanJson, fallbackDeck: fallbackDeck };
  if (window.Quantum.skills) window.Quantum.skills.register({
    id: 'praesentation', icon: '📊', name: 'Präsentations-Studio', desc: 'Erstellt KI-Foliendecks im Browser und exportiert PDF sowie editierbare PPTX', usage: '/skill praesentation <thema>',
    run: function (input) { open(input); return '📊 **PRÄSENTATIONS-STUDIO** geöffnet. Erstelle dein Deck und exportiere es kostenlos als PDF oder editierbare PPTX.'; },
  });
})();
