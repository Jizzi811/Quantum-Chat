# NVIDIA / OpenRouter setup for Quantum

Configure these variables in Netlify under **Project configuration → Environment variables**:

- `NVIDIA_API_KEY`: your NVIDIA Build API key (preferred)
- `NVIDIA_MODEL`: `nvidia/nemotron-3-super-120b-a12b`
- `OPENROUTER_API_KEY`: optional fallback OpenRouter key
- `OPENROUTER_MODEL`: optional fallback, for example `openrouter/free`
- `QUANTUM_ACCESS_TOKEN`: a long random password used to protect the AI gateway
- `QUANTUM_ALLOWED_ORIGIN`: the exact public Quantum URL, for example `https://your-site.netlify.app`

Redeploy the site after saving the variables. The access token is requested in Quantum when an AI skill is used and is kept only in the current browser tab's session storage.

Provider priority: `CUSTOM_AI_URL` (self-hosted OpenAI-compatible gateway) → `NEBIUS_API_KEY` (Nebius Token Factory) → `GEMINI_API_KEY` (see `GEMINI_SETUP.md`, free tier) → `GROQ_API_KEY` (see `GROQ_SETUP.md`, free tier) → `NVIDIA_API_KEY` → `OPENROUTER_API_KEY`. OpenRouter is used only when no other provider is configured. The gateway accepts only the configured site origin and access token and limits each client to ten requests per minute.
