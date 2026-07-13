/* QUANTUM — Robuster Parser für Modellantworten (NVIDIA/Qwen, OpenRouter).
   Modellantworten dürfen nie mit einem ungeschützten JSON.parse() verarbeitet
   werden: Sie können Markdown-Zäune, Erklärtext, direktes HTML oder bereits
   geparste Objekte enthalten. Läuft im Browser (window.Quantum.modelResponse)
   und in Node (module.exports) für Tests und Netlify Functions. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.Quantum = root.Quantum || {};
    root.Quantum.modelResponse = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // OpenAI-kompatible APIs liefern content als String, Objekt oder Array von
  // Parts ({type:'text', text:'…'}). Arrays werden zu Text zusammengefügt.
  function contentToText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          if (part && typeof part.content === 'string') return part.content;
          return '';
        })
        .join('');
    }
    return null;
  }

  // Nimmt den Inhalt des ersten Markdown-Codeblocks (```json, ```html, ```),
  // sonst den Text ohne einzelne verirrte Zaun-Zeilen.
  function stripFences(text) {
    const fenced = text.match(/```[a-zA-Z0-9_-]*[^\S\n]*\n?([\s\S]*?)```/);
    if (fenced && fenced[1].trim()) return fenced[1].trim();
    return text.replace(/^```[a-zA-Z0-9_-]*[^\S\n]*$/gm, '').trim();
  }

  /* Reasoning-Modelle (DeepSeek-R1, Qwen3.x) schreiben <think>…</think>-
     Denkblöcke in die Antwort. Geschlossene Blöcke werden entfernt; ein
     nicht geschlossener Block bedeutet: das Modell hat nur gedacht und
     nie geantwortet — dann bleibt nichts Verwertbares übrig. */
  function stripThinking(text) {
    let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const open = out.search(/<think>/i);
    if (open !== -1) out = out.slice(0, open).trim();
    return out;
  }

  function findHtmlStart(text) {
    const doctype = text.search(/<!doctype\s+html/i);
    const htmlTag = text.search(/<html[\s>]/i);
    if (doctype === -1) return htmlTag;
    if (htmlTag === -1) return doctype;
    return Math.min(doctype, htmlTag);
  }

  function extractHtmlDocument(text) {
    const start = findHtmlStart(text);
    if (start === -1) return null;
    const closing = text.toLowerCase().lastIndexOf('</html>');
    const end = closing > start ? closing + '</html>'.length : text.length;
    return text.slice(start, end).trim();
  }

  // Findet das erste balancierte JSON-Objekt oder -Array; Klammern innerhalb
  // von Strings (inkl. Escapes) werden ignoriert.
  function extractFirstJson(text) {
    const start = text.search(/[{[]/);
    if (start === -1) return null;
    const open = text[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === open) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (_) {
            return null;
          }
        }
      }
    }
    return null;
  }

  /* Zerlegt eine Modellantwort in {kind, …}:
     - kind 'json':  data enthält das geparste Objekt/Array (oder den bereits
                     geparsten content unverändert — kein doppeltes Parsen)
     - kind 'html':  html enthält das HTML-Dokument (ohne JSON.parse)
     - kind 'text':  text enthält den bereinigten Rohtext
     - kind 'empty': keine verwertbare Antwort
     Wirft nie. */
  function parse(content) {
    if (content === null || content === undefined) return { kind: 'empty', text: '' };
    if (typeof content === 'object' && !Array.isArray(content)) {
      return { kind: 'json', data: content, text: null };
    }
    const raw = contentToText(content);
    if (raw === null) return { kind: 'json', data: content, text: null };
    const text = stripFences(stripThinking(String(raw).trim()));
    if (!text) return { kind: 'empty', text: '' };

    if (text[0] === '<') {
      const html = extractHtmlDocument(text);
      if (html) return { kind: 'html', html, text };
    }
    try {
      return { kind: 'json', data: JSON.parse(text), text };
    } catch (_) { /* weiter mit Extraktion */ }
    const extracted = extractFirstJson(text);
    if (extracted !== null) return { kind: 'json', data: extracted, text };
    const html = extractHtmlDocument(text);
    if (html) return { kind: 'html', html, text };
    return { kind: 'text', text };
  }

  /* Liefert ein HTML-Dokument aus einer Modellantwort oder null, wenn die
     Antwort kein verwertbares HTML enthält (dann darf der Aufrufer auf den
     lokalen Fallback wechseln). */
  function extractHtml(content) {
    const result = parse(content);
    if (result.kind === 'html') return result.html;
    if (result.kind === 'json' && result.data && typeof result.data.html === 'string' && result.data.html.trim()) {
      return result.data.html.trim();
    }
    return null;
  }

  return { parse, extractHtml, extractFirstJson, stripFences, stripThinking, contentToText };
});
