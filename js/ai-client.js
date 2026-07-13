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
      const error = new Error(data.error || ('Quantum AI Gateway Fehler (HTTP ' + res.status + ').'));
      if (data.model) error.model = data.model;
      if (data.provider) error.provider = data.provider;
      throw error;
    }
    return data;
  }

  async function ask({ system, prompt, temperature, maxTokens } = {}) {
    return request({ system, prompt, temperature, maxTokens });
  }

  window.Quantum.ai = { ask, endpoint };
})();
