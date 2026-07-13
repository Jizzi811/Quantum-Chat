# Gemini setup for Quantum (kostenlos)

Google Gemini hat einen großzügigen Free-Tier (Flash-Modelle: ca. 1.500
Anfragen/Tag, keine Kreditkarte nötig). Quantum spricht Gemini über Googles
OpenAI-kompatiblen Endpunkt an.

**Wichtig — Billing-Falle:** Sobald im zugehörigen Google-Cloud-Projekt
Billing aktiviert wird, verschwindet der Free-Tier komplett und jeder Aufruf
kostet Geld. Also für Quantum nie eine Karte hinterlegen bzw. ein separates
Projekt ohne Billing verwenden.

## Einrichtung

1. Kostenlosen API-Key erstellen: <https://aistudio.google.com/apikey>
2. In Netlify unter **Project configuration → Environment variables** setzen:
   - `GEMINI_API_KEY`: der Key aus Schritt 1 (Pflicht)
   - `GEMINI_MODEL`: optional, Standard ist `gemini-2.5-flash`
3. Site neu deployen (Deploys → Trigger deploy).

Gemini hat Vorrang vor Groq: Ein zusätzlich gesetzter `GROQ_API_KEY` kann
drinbleiben und dient als einfacher Rückweg — `GEMINI_API_KEY` löschen und
neu deployen, schon läuft wieder Groq. Die vollständige Prioritätsreihenfolge
steht in `GROQ_SETUP.md`.

## Empfohlene Gemini-Modelle

| Modell | Eignung |
| --- | --- |
| `gemini-2.5-flash` | Standard: stark bei Code/HTML, großzügiger Free-Tier |
| `gemini-3-flash` | Neuer und oft besser — ID vorher unter <https://ai.google.dev/gemini-api/docs/models> prüfen |
| `gemini-2.5-flash-lite` | Sparsamer beim Rate-Limit, einfachere Antworten |

Pro-Modelle (z. B. `gemini-2.5-pro`) sind im Free-Tier auf ~50 Anfragen/Tag
begrenzt und für Quantum nicht praktikabel. Ist ein konfiguriertes Modell
nicht mehr verfügbar (HTTP 404/410), wechselt das Gateway automatisch auf
das Standardmodell zurück.
