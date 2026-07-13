# Groq setup for Quantum (kostenlos)

Groq ist der bevorzugte KI-Provider von Quantum: kostenloser Free-Tier ohne
Kreditkarte (ca. 30 Anfragen/Minute, 14.400/Tag) und sehr schnelle Antworten.

**Achtung Namensverwechslung:** Groq (`api.groq.com`, Hardware-Firma mit
Gratis-API) ist nicht dasselbe wie Grok (xAI/Twitter, kostenpflichtig).
Quantum nutzt Groq.

## Einrichtung

1. Kostenlosen API-Key erstellen: <https://console.groq.com/keys>
2. In Netlify unter **Project configuration → Environment variables** setzen:
   - `GROQ_API_KEY`: der Key aus Schritt 1 (Pflicht)
   - `GROQ_MODEL`: optional, Standard ist `llama-3.3-70b-versatile`
   - `QUANTUM_ACCESS_TOKEN`: langes Zufallspasswort, schützt das Gateway (Pflicht)
   - `QUANTUM_ALLOWED_ORIGIN`: exakte öffentliche URL, z. B. `https://your-site.netlify.app`
3. Site neu deployen (Deploys → Trigger deploy).

## Provider-Priorität

Das Gateway nimmt den ersten konfigurierten Provider in dieser Reihenfolge:

1. `CUSTOM_AI_URL` + `CUSTOM_AI_MODEL` (+ optional `CUSTOM_AI_KEY`) —
   beliebiges selbst gehostetes OpenAI-kompatibles Gateway (z. B. OmniRoute,
   LiteLLM). Als URL die Basis bis einschließlich `/v1` angeben,
   z. B. `https://mein-server.example.com/v1`. Das Gateway muss öffentlich
   erreichbar sein — `localhost` auf dem eigenen PC funktioniert nicht,
   weil die Netlify Functions in der Cloud laufen.
2. `GROQ_API_KEY` (+ optional `GROQ_MODEL`)
3. `NVIDIA_API_KEY` (+ optional `NVIDIA_MODEL`)
4. `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`)

Ein noch vorhandener `NVIDIA_API_KEY` stört also nicht: sobald
`GROQ_API_KEY` gesetzt ist, wird Groq verwendet.

## Empfohlene Groq-Modelle

| Modell | Eignung |
| --- | --- |
| `llama-3.3-70b-versatile` | Standard: Chat + Spiele-Generierung, gutes Allround-Modell |
| `llama-3.1-8b-instant` | Sehr schnell und sparsam beim Rate-Limit, einfachere Antworten |

Ist ein konfiguriertes Modell nicht mehr verfügbar (HTTP 404/410), wechselt
das Gateway automatisch auf das Standardmodell zurück.
