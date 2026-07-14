# Design: Alltagshelfer-Erweiterung für Quantum-Chat

**Datum:** 2026-07-14
**Branch:** `claude/busy-fermi-g9q4y6`

## Ziel

Vier Erweiterungen der Quantum-Chat-App, die den bestehenden Stil und die
bestehende Architektur (Skill-System, schlüsselfreie APIs, KI-Gateway,
`.webm`-Export im Browser) fortführen:

1. **Songsee → Beat-Visualizer** – aus dem statischen Spektrogramm-Tool wird
   eine audio-reaktive Neon-Visualisierung mit Video-Export.
2. **Übersetzer** – KI-gestützter Übersetzer als neuer Übersicht-Tab.
3. **URL im Video-Studio** – eine URL im Prompt wird erkannt, ihr Textinhalt
   geladen und als Grundlage fürs Video verwendet.
4. **Faktenchecker** – Wikipedia-gestützter Faktencheck mit KI-Urteil.

Alle vier sind voneinander unabhängig und einzeln testbar.

## Architektur-Kontext (bestehend)

- Skills registrieren sich über `window.Quantum.skills.register({ id, icon,
  name, desc, usage, run(input) })` und werden per `/skill <id>` aufgerufen.
- KI-Zugriff läuft über `window.Quantum.ai` (`ai.hasAccess()`,
  `ai.ask({ system, prompt, temperature, maxTokens })`, optional
  `ai.askStream(...)`); das Ergebnis hat `.text`, `.model`, `.provider`.
- Schlüsselfreie Live-Daten kommen wie in `js/agents-live.js` per `fetch`
  von CORS-fähigen APIs (Wikipedia, Open-Meteo, …).
- Die „Übersicht" (`index.html`, `.q-panel--autos`) hat eine Tab-Leiste
  (`.overview-tabs` / `[data-overview-tab]`) mit Panels
  (`[data-overview-panel]`). Das Umschalten wird aktuell **in `js/songsee.js`**
  verdrahtet.
- Testkonvention: `node --test tests/*.test.js`; jede Skill-Datei legt ihre
  reinen Funktionen unter `window.Quantum.<modul>` ab, Tests laden das IIFE
  per `vm.runInThisContext` mit gemocktem `window`/`Quantum`.

## Querschnitts-Änderung: Tab-Umschaltung entkoppeln

Die generische `[data-overview-tab]`-Umschaltung wird aus `js/songsee.js`
herausgelöst und in eine Stelle verschoben, die **immer** läuft (unabhängig
davon, ob ein einzelnes Panel existiert). So bleiben alle vier Tabs
(Automationen · Songsee · Übersetzer · Faktenchecker) funktionsfähig, auch
wenn ein Panel-Skript früh zurückkehrt.

Die Übersicht bekommt damit vier Tab-Buttons und vier Panels.

---

## 1. Songsee → Beat-Visualizer

**Datei:** `js/songsee.js` (umgebaut), `css/songsee.css` (erweitert),
`index.html` (Panel angepasst).

**Verhalten:**
- Audiodatei wird wie bisher lokal per Web-Audio dekodiert (kein Upload).
- Statt eines Standbilds wird die Datei **abgespielt**; ein `AnalyserNode`
  liefert pro Frame die Frequenzdaten.
- Auf dem Canvas läuft eine **animierte Neon-Visualisierung** im Quantum-Look
  (Cyan `#26f7ff`, Magenta `#ff3b81`, dunkler Hintergrund).
- **Beat-/Bass-Erkennung:** gleitender Energie-Durchschnitt der tiefen
  Frequenz-Bins; überschreitet die aktuelle Bass-Energie den Schnitt deutlich,
  wird ein Puls/Flash ausgelöst.
- **Presets (Farbstil-Auswahl bleibt, Visual-Stil kommt dazu):**
  `Ringe/Radial` (Default), `Balken`, `Partikel`.
- **Export als `.webm` inkl. Ton:** Canvas-Videospur (`canvas.captureStream`)
  + Audiospur (`MediaStreamAudioDestinationNode`) werden zu einem MediaStream
  kombiniert und per `MediaRecorder` aufgenommen (gleiche Technik wie im
  Video-Studio, ergänzt um die Audiospur). Download über einen Blob-Link.
- Steuerung: Datei wählen · Visual-Stil · Farbstil · Play/Pause · Aufnahme
  starten/stoppen (Export).

**Testbare, reine Funktionen** (unter `window.Quantum.songsee`):
- Beat-Detektor (Energie rein → Flag/Intensität raus) als reine Funktion.
- Frequenz→Farbe-Mapping (`colorAt`) bleibt rein und testbar.

**Grenzen:** Export/Playback brauchen Browser-APIs (MediaRecorder, Web-Audio);
die Node-Tests decken nur die reinen Funktionen ab.

## 2. Übersetzer

**Datei:** neu `js/translator.js`, `index.html` (neuer Tab + Panel), evtl.
`css/` (kleine Ergänzung, sonst bestehende Panel-Styles nutzen).

**Verhalten:**
- Übersicht-Tab **„🌍 ÜBERSETZER"** mit Panel: Quelltext-Feld →
  Zielsprachen-Auswahl (inkl. „automatisch erkennen") → Button **ÜBERSETZEN**
  → Ergebnisfeld mit Kopier-Button.
- Nutzt `Quantum.ai`: System-Prompt „übersetze exakt in die Zielsprache, gib
  nur die Übersetzung zurück". Quellsprache erkennt das Modell selbst.
- Zusätzlich Chat-Skill `/skill uebersetzer <text>` (Zielsprache per Prefix
  wie `en:` oder Standard Deutsch/Englisch je nach Eingabe).
- Ohne KI-Zugang: klarer Hinweis wie bei den anderen KI-Skills (🔑).

**Testbare, reine Funktionen** (unter `window.Quantum.translator`):
- Prompt-Bau (Text + Zielsprache → Request-Objekt).
- Parsing der Zielsprache aus der Chat-Eingabe.

## 3. URL im Video-Studio

**Datei:** `js/video-studio.js` (erweitert), `tests/video-studio.test.js`
(neue Fälle).

**Verhalten:**
- Im `run(input)` wird eine **URL im Prompt** erkannt (reine Funktion
  `extractUrl(text)`).
- Liegt eine URL vor, wird **nur der Textinhalt** der Seite über einen
  Reader-Proxy (`https://r.jina.ai/<url>`, CORS-fähig) geladen, auf ~5.000
  Zeichen gekürzt und als Beschreibung ans Modell gegeben; die restlichen
  Prompt-Worte bleiben als Stil-Hinweis erhalten.
- **Keine URL → unverändertes Verhalten.**
- **Fehlertoleranz:** schlägt der Abruf fehl (offline/blockiert), wird still
  auf den bisherigen Text-Prompt zurückgefallen; der Nutzer sieht einen
  dezenten Statushinweis.
- Nur Text (keine externen Bilder) ⇒ der `.webm`-Export bleibt taint-frei.

**Testbare, reine Funktionen** (unter `window.Quantum.videoStudio`):
- `extractUrl(text)` – findet die erste http(s)-URL oder `null`.
- `buildReaderUrl(url)` – baut die Reader-Proxy-URL.
- `truncateContent(text, max)` – kürzt sauber an Wortgrenze.

## 4. Faktenchecker

**Datei:** neu `js/factcheck.js`, in `index.html` als **Chat-Skill** *und*
**Übersicht-Tab „🔍 FAKTENCHECK"** eingebunden.

**Verhalten:**
- Aufruf per `/skill faktencheck <Behauptung>` oder über den Tab (Textfeld +
  Button + Ergebnis).
- Schritt 1: Kernbegriffe aus der Behauptung extrahieren (Stoppwörter raus,
  wie in `hnTrends`), Wikipedia (de, keyless) nach passenden Artikeln fragen,
  Einleitungs-Auszüge als **Belege** holen.
- Schritt 2: Behauptung **+ Belege** ans Gateway-Modell mit striktem Prompt
  (nur auf Basis der Belege urteilen, nicht aus dem Gedächtnis).
- Ausgabe: **Urteil** ✅ Stimmt / ❌ Stimmt nicht / ⚠️ Teilweise·Unklar,
  1–2 Sätze Begründung, **Quell-Link(s)**.
- Ohne KI-Zugang: zeigt die gefundenen Belege + Hinweis, dass das automatische
  Urteil KI benötigt. Kein Wikipedia-Treffer: ehrliches „keine belastbare
  Quelle gefunden".
- **Ehrliche Grenze im Ergebnis vermerkt:** gut für enzyklopädische Aussagen,
  schwach bei tagesaktuellen Ereignissen (Wikipedia als Faktenbasis).

**Testbare, reine Funktionen** (unter `window.Quantum.factcheck`):
- Kernbegriff-Extraktion (Behauptung → Suchbegriffe).
- Formatierung von Urteil + Belegen + Quelle.

---

## Umsetzungsreihenfolge

1. Tab-Umschaltung aus `songsee.js` herauslösen (Querschnitt, entsperrt 2 & 4).
2. Songsee → Beat-Visualizer.
3. Übersetzer (Tab + Skill).
4. URL im Video-Studio (mit neuen Tests).
5. Faktenchecker (Tab + Skill).
6. `index.html`: vier Tabs + Panels + Script-Includes verdrahten.
7. `node --test` grün, dann committen und pushen.

## Nicht im Scope (YAGNI)

- Kein neuer bezahlter API-Key; nur schlüsselfreie APIs + vorhandenes Gateway.
- Keine Live-News-Quelle für den Faktenchecker (bewusst Wikipedia-basiert).
- Kein Bild-Import beim URL-Video (nur Text, um den Export nicht zu brechen).
