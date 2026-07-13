window.Quantum = window.Quantum || {};

(function () {
  'use strict';
  const endpoint = '/.netlify/functions/ai';

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

  function hasAccess() {
    try { return !!sessionStorage.getItem('quantum.ai.access'); } catch (_) { return false; }
  }

  function setAccess(token) {
    try {
      if (token) sessionStorage.setItem('quantum.ai.access', token);
      else sessionStorage.removeItem('quantum.ai.access');
    } catch (_) { /* privater Modus */ }
  }

  window.Quantum.ai = { ask, endpoint, hasAccess, setAccess };
})();
