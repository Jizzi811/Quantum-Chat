/* QUANTUM — gemeinsame Helfer für die AI-Functions (ai.js, ai-stream.mjs). */

/* Unterstützte Provider in Prioritätsreihenfolge: der erste, dessen
   API-Key gesetzt ist, gewinnt. Alle sprechen die OpenAI-kompatible
   Chat-Completions-API — nur Basis-URL, Key und Modell unterscheiden sich.
   - gemini:     kostenloser Free-Tier (aistudio.google.com/apikey)
   - groq:       kostenloser Free-Tier (console.groq.com/keys), sehr schnell
   - nvidia:     NVIDIA Build (integrate.api.nvidia.com)
   - openrouter: Sammel-Gateway mit freien Modellen */
const PROVIDERS = [
  {
    name: 'gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
    defaultModel: 'gemini-2.5-flash',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
  },
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    defaultModel: 'llama-3.3-70b-versatile',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
  },
  {
    name: 'nvidia',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
    defaultModel: 'qwen/qwen3.5-122b-a10b',
    keyEnv: 'NVIDIA_API_KEY',
    modelEnv: 'NVIDIA_MODEL',
  },
  {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: null,
    defaultModel: 'openrouter/free',
    keyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
  },
];

/* Ermittelt den aktiven Provider aus den Umgebungsvariablen.
   CUSTOM_AI_URL (+ CUSTOM_AI_MODEL, optional CUSTOM_AI_KEY) hat Vorrang und
   erlaubt jedes selbst gehostete OpenAI-kompatible Gateway (z. B. OmniRoute
   oder LiteLLM): als Basis-URL bis einschließlich /v1 angeben. */
function resolveProvider() {
  const customUrl = envValue('CUSTOM_AI_URL');
  const customModel = envValue('CUSTOM_AI_MODEL');
  if (customUrl && customModel) {
    const base = customUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    return {
      name: 'custom',
      url: base + '/chat/completions',
      modelsUrl: base + '/models',
      defaultModel: customModel,
      apiKey: envValue('CUSTOM_AI_KEY'),
      model: customModel,
    };
  }
  for (const provider of PROVIDERS) {
    const apiKey = envValue(provider.keyEnv);
    if (apiKey) {
      return {
        ...provider,
        apiKey,
        model: envValue(provider.modelEnv) || provider.defaultModel,
      };
    }
  }
  return null;
}

/* Alternative Modell-IDs für den 404/410-Retry. Gemini akzeptiert je nach
   Endpunkt-Variante "gemini-…" oder "models/gemini-…" — erst die jeweils
   andere Namensform probieren, danach das Default-Modell. */
function fallbackModels(config, model) {
  const alternates = [];
  if (config.name === 'gemini') {
    alternates.push(model.startsWith('models/') ? model.slice('models/'.length) : 'models/' + model);
  }
  if (model !== config.defaultModel && !alternates.includes(config.defaultModel)) {
    alternates.push(config.defaultModel);
  }
  return alternates;
}

/* Holt die Modell-Liste des Providers (OpenAI-Format: { data: [{ id }] }). */
async function fetchModelIds(config) {
  try {
    const res = await fetch(config.modelsUrl, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    });
    if (!res.ok) return [];
    const data = JSON.parse(await res.text());
    return (data.data || []).map((entry) => entry.id).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/* Wählt aus Googles Modell-Liste das beste Chat-Modell: höchste Gemini-
   Version, Flash vor Pro (großzügigerer Free-Tier), stabile Varianten vor
   Preview/Exp. Nötig, weil Google alte Modelle für neue API-Keys sperrt
   ("no longer available to new users") und die IDs laufend umbenennt. */
function pickGeminiModel(ids) {
  const candidates = ids
    .map((id) => {
      const match = /^(?:models\/)?gemini-(\d+(?:\.\d+)?)-(flash|pro)([\w.-]*)$/.exec(id);
      if (!match) return null;
      const suffix = match[3] || '';
      if (/(lite|tts|image|audio|live|robotics|embedding)/i.test(suffix)) return null;
      return {
        id,
        version: parseFloat(match[1]),
        flash: match[2] === 'flash' ? 1 : 0,
        stable: suffix === '' ? 1 : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.version - a.version) || (b.flash - a.flash) || (b.stable - a.stable));
  return candidates.length ? candidates[0].id : null;
}

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
  PROVIDERS,
  resolveProvider,
  fallbackModels,
  fetchModelIds,
  pickGeminiModel,
  envValue,
  safeEqual,
  makeRateLimiter,
};
