window.Quantum = window.Quantum || {};

(function () {
  'use strict';
  const endpoint = '/.netlify/functions/ai';
  const streamEndpoint = '/.netlify/functions/ai-stream';

  function accessToken() {
    let token = sessionStorage.getItem('quantum.ai.access');
    if (!token) {
      token = window.prompt('Quantum KI-Zugangscode eingeben:') || '';
      if (token) sessionStorage.setItem('quantum.ai.access', token);
    }
    return token;
  }

  async function request(payload, retry = true) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* handled below */ }
    if (res.status === 401) {
      sessionStorage.removeItem('quantum.ai.access');
      if (retry) return request(payload, false);
    }
    if (!res.ok) {
      /* 504 ohne JSON-Body = Netlify hat die Function nach 10 s abgebrochen */
      const fallbackMsg = res.status === 504
        ? 'Zeitlimit überschritten (HTTP 504): Das Modell hat zu lange gebraucht. Bitte erneut versuchen.'
        : 'Quantum AI Gateway Fehler (HTTP ' + res.status + ').';
      const error = new Error(data.error || fallbackMsg);
      if (data.model) error.model = data.model;
      if (data.provider) error.provider = data.provider;
      throw error;
    }
    return data;
  }

  async function ask({ system, prompt, temperature, maxTokens } = {}) {
    return request({ system, prompt, temperature, maxTokens });
  }

  /* Streaming-Variante über /ai-stream: liest Server-Sent-Events und setzt
     die Antwort zusammen. Umgeht Netlifys 10-Sekunden-Limit für lange
     Generierungen. onDelta (optional) bekommt den bisherigen Gesamttext. */
  async function askStream({ system, prompt, temperature, maxTokens, onDelta } = {}) {
    const res = await fetch(streamEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify({ system, prompt, temperature, maxTokens }),
    });
    if (!res.ok || !res.body) {
      let data = {};
      try { data = await res.json(); } catch (_) { /* kein JSON-Body */ }
      const error = new Error(data.error || ('Quantum AI Stream Fehler (HTTP ' + res.status + ').'));
      if (data.model) error.model = data.model;
      if (data.provider) error.provider = data.provider;
      throw error;
    }
    let model = res.headers.get('x-quantum-model') || '';
    const provider = res.headers.get('x-quantum-provider') || 'nvidia';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let finishReason = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload);
          model = chunk.model || model;
          const choice = chunk.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta?.content || '';
          if (delta) {
            text += delta;
            if (onDelta) onDelta(text);
          }
        } catch (_) { /* unvollständige/fremde Zeile überspringen */ }
      }
    }
    if (!text.trim()) throw new Error('Der Stream lieferte keinen Inhalt.');
    return { text, model, provider, finishReason };
  }

  function hasAccess() {
    try { return !!sessionStorage.getItem('quantum.ai.access'); } catch (_) { return false; }
  }

  function setAccess(token) {
    try {
      if (token) sessionStorage.setItem('quantum.ai.access', token);
      else sessionStorage.removeItem('quantum.ai.access');
    } catch (_) { /* privater Modus */ }
  }

  window.Quantum.ai = { ask, askStream, endpoint, streamEndpoint, hasAccess, setAccess };
})();
