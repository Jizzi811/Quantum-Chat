/* QUANTUM — gemeinsame Helfer für die AI-Functions (ai.js, ai-stream.mjs). */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODELS_URL = 'https://integrate.api.nvidia.com/v1/models';
const NVIDIA_DEFAULT_MODEL = 'qwen/qwen3.5-122b-a10b';

/* Liest eine Umgebungsvariable und bereinigt typische Paste-Fehler aus dem
   Netlify-UI: der Variablenname landet mit im Wert ("NVIDIA_MODEL=qwen/…"),
   umschließende Anführungszeichen oder Leerzeichen. */
function envValue(name) {
  let value = String(process.env[name] || '').trim();
  if (value.toUpperCase().startsWith(name.toUpperCase() + '=')) {
    value = value.slice(name.length + 1).trim();
  }
  value = value.replace(/^["']+|["']+$/g, '').trim();
  return value;
}

function safeEqual(a, b) {
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/* Einfaches In-Memory-Rate-Limit pro Lambda-Instanz. */
function makeRateLimiter(limit = 10, windowMs = 60000) {
  const requests = new Map();
  return function withinRateLimit(ip) {
    const now = Date.now();
    const recent = (requests.get(ip) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    requests.set(ip, recent);
    return true;
  };
}

module.exports = {
  OPENROUTER_URL,
  NVIDIA_URL,
  NVIDIA_MODELS_URL,
  NVIDIA_DEFAULT_MODEL,
  envValue,
  safeEqual,
  makeRateLimiter,
};
