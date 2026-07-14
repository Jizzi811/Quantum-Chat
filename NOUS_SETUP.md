# Nous Portal / Hermes setup for Quantum

Nous Portal ([portal.nousresearch.com](https://portal.nousresearch.com)) ist der
Inferenz-Dienst von Nous Research. Er stellt die hauseigenen **Hermes**-Modelle
(u. a. `Hermes-4-70B` und `Hermes-4-405B`) über eine OpenAI-kompatible API bereit
— dieselbe Schnittstelle, die Quantums Gateway ohnehin spricht. Damit lässt sich
Hermes direkt als KI-Modell im Chat und in allen Skills nutzen.

## Kostenlose Alternative: Hermes über OpenRouter (ohne Nous-Key)

Nous Portal ist **kostenpflichtig**. Die Hermes-Modelle gibt es aber gratis
über OpenRouter, das in Quantum-Chat bereits als Provider eingebaut ist — du
brauchst dann **keinen `NOUS_API_KEY`**:

1. Kostenlosen OpenRouter-Key erstellen: <https://openrouter.ai/keys>
2. In Netlify unter **Project configuration → Environment variables** setzen:
   - `OPENROUTER_API_KEY`: dein Key
   - `OPENROUTER_MODEL`: `nousresearch/hermes-3-llama-3.1-405b:free`
   - `NOUS_API_KEY` **nicht** setzen (bzw. leeren), damit nicht der bezahlte
     Nous-Provider greift
3. Site neu deployen.

> Hinweis: Das kostenlose `nousresearch/hermes-3-llama-3.1-405b:free` wird laut
> OpenRouter am **19. Juli 2026** abgeschaltet. Danach — oder als dauerhaft
> freie Wahl — einfach `OPENROUTER_MODEL` weglassen: Standard ist dann
> `openrouter/free`, das automatisch ein verfügbares Gratis-Modell wählt (nicht
> zwingend Hermes). Freie OpenRouter-Modelle sind auf ca. 20 Anfragen/Minute
> begrenzt.

## Einrichtung (bezahltes Nous Portal)

1. API-Key erstellen: In [portal.nousresearch.com](https://portal.nousresearch.com)
   anmelden und unter **API Keys** einen Schlüssel anlegen.
2. In Netlify unter **Project configuration → Environment variables** setzen:
   - `NOUS_API_KEY`: der Key aus Schritt 1 (Pflicht)
   - `NOUS_MODEL`: optional, Standard ist `Hermes-4-70B`
   - `QUANTUM_ACCESS_TOKEN`: langes Zufallspasswort, schützt das Gateway (Pflicht)
   - `QUANTUM_ALLOWED_ORIGIN`: exakte öffentliche URL, z. B. `https://your-site.netlify.app`
3. Site neu deployen (Deploys → Trigger deploy).

Die API ist OpenAI-kompatibel:
Basis-URL `https://inference-api.nousresearch.com/v1`, Authentifizierung per
`Authorization: Bearer <NOUS_API_KEY>`.

## Provider-Priorität

Das Gateway nimmt den ersten konfigurierten Provider in dieser Reihenfolge:

1. `CUSTOM_AI_URL` + `CUSTOM_AI_MODEL` (+ optional `CUSTOM_AI_KEY`)
2. **`NOUS_API_KEY`** (+ optional `NOUS_MODEL`) — Nous Portal / Hermes
3. `NEBIUS_API_KEY` (+ optional `NEBIUS_MODEL`)
4. `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) — siehe `GEMINI_SETUP.md`
5. `GROQ_API_KEY` (+ optional `GROQ_MODEL`) — siehe `GROQ_SETUP.md`
6. `NVIDIA_API_KEY` (+ optional `NVIDIA_MODEL`)
7. `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`)

Sobald `NOUS_API_KEY` gesetzt ist, wird also Hermes verwendet — auch wenn noch
andere Keys (z. B. `GROQ_API_KEY`) vorhanden sind. Soll ein anderer Provider
Vorrang haben, `NOUS_API_KEY` leeren oder `CUSTOM_AI_URL` nutzen.

## Empfohlene Hermes-Modelle

| Modell (`NOUS_MODEL`) | Eignung |
| --- | --- |
| `Hermes-4-70B` | Standard: schnelles Allround-Modell, gutes Verhältnis aus Tempo und Qualität |
| `Hermes-4-405B` | Stärkstes Modell (Reasoning, lange Texte), aber langsamer — für die nicht-streamende Function ggf. am 10-Sekunden-Limit von Netlify (siehe unten) |

Exakte, aktuell verfügbare Modell-IDs listet die API selbst:

```bash
curl https://inference-api.nousresearch.com/v1/models \
  -H "Authorization: Bearer $NOUS_API_KEY"
```

Die passende `id` aus dieser Liste in Netlify als `NOUS_MODEL` eintragen und neu
deployen. Ist ein konfiguriertes Modell nicht mehr verfügbar (HTTP 404/410),
wechselt das Gateway automatisch auf das Standardmodell zurück.

## Hinweis zum Zeitlimit

Netlify bricht die synchrone `ai`-Function nach ca. 10 Sekunden ab (HTTP 504).
Sehr große Modelle wie `Hermes-4-405B` können bei langen Antworten daran
scheitern. Skills, die den Streaming-Endpunkt (`ai-stream`) nutzen — etwa das
Video-Studio —, umgehen das Limit; für normalen Chat ist `Hermes-4-70B` die
robustere Wahl.
