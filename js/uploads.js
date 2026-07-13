/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Referenz-Upload
   📎-Button neben der Chat-Eingabe: hängt Referenzen/PDFs an. Text-
   dateien werden direkt gelesen, PDFs per lazy geladenem pdf.js in
   Text umgewandelt, Bilder als Referenz vermerkt. Der extrahierte Text
   wird der nächsten KI-Nachricht als Kontext vorangestellt.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const MAX_CHARS_PER_FILE = 8000;
  const MAX_FILES = 5;
  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  /* { name, kind: 'text'|'image', text, size } */
  const attachments = [];

  function isTextFile(file) {
    return /\.(txt|md|markdown|json|csv|log|tsv|ya?ml)$/i.test(file.name) || /^text\//.test(file.type || '');
  }

  function readText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      reader.readAsText(file);
    });
  }

  let pdfLibPromise = null;
  function loadPdfLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDFJS_URL;
      script.onload = () => {
        if (window.pdfjsLib) {
          try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (_) { /* egal */ }
          resolve(window.pdfjsLib);
        } else reject(new Error('pdf.js nicht verfügbar.'));
      };
      script.onerror = () => reject(new Error('pdf.js konnte nicht geladen werden (offline?).'));
      document.head.appendChild(script);
    });
    return pdfLibPromise;
  }

  async function readPdf(file) {
    const lib = await loadPdfLib();
    const buffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buffer }).promise;
    let out = '';
    const pages = Math.min(pdf.numPages, 30);
    for (let i = 1; i <= pages && out.length < MAX_CHARS_PER_FILE; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return out.trim();
  }

  /* Baut den Kontext-Block, der der KI-Nachricht vorangestellt wird. */
  function getContext() {
    const texts = attachments.filter((a) => a.text).map((a) =>
      '### Referenz: ' + a.name + '\n' + a.text.slice(0, MAX_CHARS_PER_FILE));
    if (!texts.length) return '';
    return 'Der Nutzer hat folgende Referenz(en) angehängt. Nutze sie als Kontext für die Antwort:\n\n'
      + texts.join('\n\n') + '\n\n---\n';
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function render() {
    const box = document.getElementById('chat-attachments');
    if (!box) return;
    box.innerHTML = '';
    attachments.forEach((att, index) => {
      const chip = document.createElement('span');
      chip.className = 'chat-chip';
      chip.setAttribute('data-testid', 'attachment-chip');
      const icon = att.kind === 'image' ? '🖼' : '📄';
      chip.innerHTML =
        '<span>' + icon + '</span>' +
        '<span class="chat-chip__name">' + esc(att.name) + '</span>' +
        '<span class="chat-chip__meta">' + (att.kind === 'image' ? 'Bild' : fmtSize(att.size)) + '</span>' +
        '<button class="chat-chip__remove" title="Entfernen" aria-label="Anhang entfernen">✕</button>';
      chip.querySelector('.chat-chip__remove').addEventListener('click', () => {
        attachments.splice(index, 1);
        render();
      });
      box.appendChild(chip);
    });
    box.hidden = attachments.length === 0;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function systemMsg(text) {
    if (window.Quantum.ui && window.Quantum.ui.system) window.Quantum.ui.system(text);
  }

  async function handleFile(file, btn) {
    if (attachments.length >= MAX_FILES) { systemMsg('📎 Maximal ' + MAX_FILES + ' Anhänge gleichzeitig.'); return; }
    if (btn) btn.classList.add('is-busy');
    try {
      if (/^image\//.test(file.type)) {
        attachments.push({ name: file.name, kind: 'image', text: '', size: file.size });
        systemMsg('📎 Bild „' + file.name + '" angehängt (als Referenz vermerkt — der Text-Chat wertet Bildinhalte nicht aus).');
      } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        systemMsg('📎 PDF „' + file.name + '" wird gelesen …');
        const text = await readPdf(file);
        attachments.push({ name: file.name, kind: 'text', text, size: file.size });
        systemMsg(text ? '📎 PDF „' + file.name + '" eingelesen (' + text.length + ' Zeichen Kontext).'
          : '📎 „' + file.name + '" enthielt keinen extrahierbaren Text (evtl. ein Scan/Bild-PDF).');
      } else if (isTextFile(file)) {
        const text = await readText(file);
        attachments.push({ name: file.name, kind: 'text', text, size: file.size });
        systemMsg('📎 „' + file.name + '" angehängt (' + text.length + ' Zeichen Kontext).');
      } else {
        systemMsg('📎 Dateityp von „' + file.name + '" wird nicht unterstützt (PDF, Text/Markdown/JSON/CSV oder Bild).');
      }
    } catch (error) {
      systemMsg('📎 „' + file.name + '" konnte nicht verarbeitet werden: ' + (error.message || 'Fehler') + '.');
    } finally {
      if (btn) btn.classList.remove('is-busy');
      render();
    }
  }

  window.Quantum.uploads = {
    getContext,
    clear() { attachments.length = 0; render(); },
    count() { return attachments.length; },
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-upload');
    const input = document.getElementById('upload-input');
    if (!btn || !input) return;
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      for (const file of files) await handleFile(file, btn);
      input.value = '';
    });
  });
})();
