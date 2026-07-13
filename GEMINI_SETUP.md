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

## Modellwahl

`GEMINI_MODEL` kann in der Regel leer bleiben. Google sperrt ältere Modelle
für neu erstellte API-Keys ("no longer available to new users") und benennt
die IDs laufend um — das Gateway fängt das ab: Liefert das konfigurierte
bzw. Standardmodell ein 404, probiert es automatisch die andere Namensform
(`gemini-…` ↔ `models/gemini-…`) und wählt notfalls selbst das neueste
verfügbare Flash-Modell aus Googles Modell-Liste (stabile Version bevorzugt,
Flash vor Pro wegen des großzügigeren Free-Tiers).

Wer ein bestimmtes Modell erzwingen will, prüft die aktuell verfügbaren IDs
unter <https://ai.google.dev/gemini-api/docs/models> und trägt sie in
`GEMINI_MODEL` ein. Pro-Modelle sind im Free-Tier stark begrenzt
(~50 Anfragen/Tag) und für Quantum nicht praktikabel.
