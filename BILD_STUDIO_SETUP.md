# Bild-Studio einrichten (Gemini Bildgenerierung)

Das Bild-Studio (`/skill bild`) erzeugt Bilder über Geminis native Bildgenerierung.
Die Function `netlify/functions/image.js` nutzt dafür einen **eigenen** Key.

## ⚠ Wichtig: eigener Key nur für Bilder
Der Chat wählt seinen Provider über `GEMINI_API_KEY`, `GROQ_API_KEY`, … aus —
**Gemini hat dabei die höchste Priorität**. Würdest du deinen Bild-Key als
`GEMINI_API_KEY` setzen, würde **dein Chat plötzlich auf Gemini umspringen**.

Deshalb nutzt die Bild-Function ausschließlich die Variable **`GEMINI_IMAGE_API_KEY`**.
Dein Chat bleibt dadurch unverändert auf deinem bestehenden Key (z. B. OpenAI/Custom).

## Netlify-Umgebungsvariablen

| Variable | Pflicht | Wert |
|---|---|---|
| `GEMINI_IMAGE_API_KEY` | ✅ | Google-AI-Studio-Key — **nur** für Bilder ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) |
| `QUANTUM_ACCESS_TOKEN` | ✅ | Derselbe Zugangscode wie beim Chat |
| `GEMINI_IMAGE_MODEL` | – | Default `gemini-3.1-flash-image` |
| `QUANTUM_ALLOWED_ORIGIN` | – | Origin-Schutz (wie beim Chat-Gateway) |

> Alte `imagen-*`-Werte werden automatisch auf das aktuelle Standardmodell
> umgestellt, weil Imagen 3 nicht mehr über diesen API-Endpunkt verfügbar ist.

## Nutzung
- Im Chat: `/skill bild <Beschreibung>` oder den Skill 🎨 links anklicken.
- Seitenverhältnis wählbar (1:1, 16:9, 9:16, 4:3, 3:4), Ergebnis als PNG speicherbar.
