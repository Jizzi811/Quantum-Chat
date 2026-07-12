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

  async function ask({ system, prompt, temperature, maxTokens } = {}) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify({ system, prompt, temperature, maxTokens }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* handled below */ }
    if (res.status === 401) sessionStorage.removeItem('quantum.ai.access');
    if (!res.ok) throw new Error(data.error || 'Quantum AI Gateway ist nicht erreichbar.');
    return data;
  }

  window.Quantum.ai = { ask, endpoint };
})();
