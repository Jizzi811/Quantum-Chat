# Kurs-Studio (Online-Kurs-Generator)

## Ziel

Quantum erhält ein neues In-App-Werkzeug „Kurs-Studio", das aus einem Thema
und/oder eigenem Quellmaterial einen kompletten Online-Kurs generiert und ihn
als eigenständige Datei exportiert, die verkauft oder weitergegeben werden
kann. Ein Kurs besteht aus Modulen und Lektionen mit ausformulierten Texten,
Lernzielen, Quizzes, Übungen, generierten Bildern sowie Begleitmaterial
(Lehrplan, Glossar, Ressourcen).

Der Fokus liegt auf **Export zum Verkaufen/Weitergeben** (nicht auf einem
In-App-Lernpfad mit Fortschritts-Tracking).

## Architektur

Das Kurs-Studio folgt exakt dem bestehenden Studio-Muster der App:

- Ein eigenständiges IIFE-Modul `js/course-studio.js`, das an
  `window.Quantum.courseStudio` hängt und sich über
  `window.Quantum.skills.register(...)` als Skill `kurs` registriert.
- Eigenes Styling in `css/course-studio.css` unter Nutzung der bestehenden
  Design-Tokens (`--border-soft` usw.).
- Kein Backend-Ausbau: Alle KI-Aufrufe laufen über die vorhandenen Gateways
  `window.Quantum.ai.ask` / `window.Quantum.ai.askStream`
  (`/.netlify/functions/ai` bzw. `/ai-stream`). Bilder laufen über das
  bestehende `window.Quantum.imageStudio.generate`
  (`/.netlify/functions/image`).
- Einbindung in `index.html`: `<link>` auf `css/course-studio.css`,
  `<script src="js/course-studio.js">` **nach** `image-studio.js` und
  `skills.js` (Abhängigkeiten), sowie ein Landing-Feature-Eintrag.

### Generierungs-Ansatz: Zwei Phasen mit Review

Ein vollständiger Kurs ist zu umfangreich für einen einzelnen KI-Aufruf.
Deshalb wird in zwei Phasen generiert, mit einem Review-Stopp dazwischen:

1. **Phase 1 – Lehrplan:** Ein KI-Aufruf erzeugt die Gliederung (Kurs-Titel,
   Beschreibung, Lehrplan-Übersicht, Module mit Kurzbeschreibung, Lektionen
   mit Titel und Lernzielen). Der Nutzer prüft und bearbeitet diese Struktur.
2. **Phase 2 – Ausarbeitung:** Sequenziell wird pro Lektion ein eigener
   KI-Aufruf (`askStream`, um Netlifys 10-Sekunden-Limit zu umgehen)
   ausgeführt, der Inhaltstext, Zusammenfassung, Quiz und Übungen liefert.
   Danach ein Aufruf für Glossar und Ressourcen. Falls Bilder aktiviert sind,
   werden anschließend Cover und je ein Bild pro Lektion über
   `imageStudio.generate` erzeugt. Ein Fortschrittsbalken zeigt den Stand
   („Lektion 3/12", „Bild 4/13").

## Datenmodell

Ein Kurs ist ein reines JavaScript-Objekt (keine Persistenz):

```
Kurs {
  titel, untertitel, beschreibung,
  zielgruppe, niveau, sprache,
  theme,                          // 'neon' | 'business' | 'light'
  cover,                          // Data-URL oder ''
  lehrplan: [ string ],           // Übersicht der Lernpunkte
  glossar: [ { begriff, definition } ],
  ressourcen: [ { label, notiz } ],
  module: [
    Modul {
      titel, kurzbeschreibung,
      lektionen: [
        Lektion {
          titel,
          lernziele: [ string ],
          inhalt,                 // ausformulierter Erklärtext (Markdown)
          zusammenfassung,
          bild,                   // Data-URL oder ''
          bildPrompt,
          quiz: [ { frage, optionen: [string], loesungIndex, erklaerung } ],
          uebungen: [ { aufgabe, tipp, loesung } ]
        }
      ]
    }
  ]
}
```

## Komponenten und Verantwortlichkeiten

Alle inhaltserzeugenden Kernfunktionen sind **DOM-frei und rein** (nehmen ein
Kurs-/Roh-Objekt, geben Daten oder Strings zurück), damit sie in Node mit
`node --test` (vm-Sandbox wie in `tests/ai-agents.test.js`) unit-testbar sind.
Die Modal-/KI-Logik ruft diese Funktionen auf.

### Reine Funktionen (testbar)

- `cleanJson(text)` — entfernt Code-Fences und schneidet auf das erste/letzte
  Klammernpaar zu (übernommen aus dem Muster in `js/presentation.js`).
- `parseOutline(text, params)` — validiert/normalisiert die Phase-1-Antwort in
  ein Kurs-Gerüst (Module/Lektionen ohne Inhalt); begrenzt Anzahl und
  Feldlängen; wirft bei ungültigem JSON.
- `parseLesson(text)` — validiert/normalisiert eine Phase-2-Lektion (inhalt,
  zusammenfassung, quiz, uebungen); toleriert fehlende Felder mit Defaults.
- `parseExtras(text)` — validiert/normalisiert Glossar und Ressourcen.
- `buildStandaloneHtml(kurs)` — erzeugt eine vollständige, eigenständige
  `<!doctype html>`-Seite: eingebettetes `<style>` (Theme), Inhaltsverzeichnis,
  Abschnitte pro Modul/Lektion, Bilder als `data:`-URLs, interaktive Quizzes
  (Radio-Buttons + „Lösung anzeigen" per Inline-`<script>`), Glossar als `<dl>`,
  Ressourcenliste. Alle Nutzerinhalte HTML-escaped.
- `buildPrintHtml(kurs)` — druckoptimierte Variante (Seitenumbrüche pro Modul,
  kein Inhaltsverzeichnis-Sidebar, Quiz-Lösungen markiert) für den PDF-Export.
- `buildMarkdown(kurs)` — vollständiger Markdown-Text mit Überschriften,
  Lektionstexten, Quizzes und Übungen als Listen, Glossar und Ressourcen;
  Bilder als `![alt](data:image/...;base64,...)`.
- `slugify(titel)` — Dateiname für Downloads (Muster aus `js/documents.js`).

### Prompt-Bausteine

- `outlineSystemPrompt(params)` / `outlineUserPrompt(thema, quelle, params)` —
  fordern striktes JSON-Gerüst in der gewählten `sprache`.
- `lessonSystemPrompt(params)` / `lessonUserPrompt(kontext)` — erzeugen eine
  Lektion; `kontext` enthält Kurstitel, Zielgruppe, Niveau, Sprache,
  Modultitel, Lektionstitel, Lernziele und die Titel der Nachbarlektionen
  (gegen inhaltliche Überschneidung).
- `extrasSystemPrompt` / `extrasUserPrompt(kurs)` — erzeugen Glossar und
  Ressourcen aus dem fertigen Kurs.

### Modal-/UI-Schicht (nicht unit-getestet, dünn gehalten)

Drei Panels innerhalb eines Modals (wiederverwendete `tts-studio`-Struktur):

1. **Setup:** Thema/Prompt; Quellmaterial (Textarea + 📎-Datei-Button, der
   Text/PDF über den bestehenden Upload-/`pdf.js`-Mechanismus einliest);
   Parameter Zielgruppe, Niveau (Einsteiger/Fortgeschritten/Profi), Sprache
   (Default Deutsch), Anzahl Module, Lektionen pro Modul, Theme, Checkboxen
   „Bilder generieren" und „Quizzes". Button „📋 Lehrplan generieren".
2. **Review & Ausarbeiten:** editierbare Gliederung (Titel ändern; Module und
   Lektionen hinzufügen/löschen/hoch/runter — kein Drag&Drop). Button
   „✍️ Kurs ausarbeiten" startet Phase 2 mit Fortschrittsbalken und
   Abbrechen-Möglichkeit.
3. **Vorschau & Export:** scrollbare Kurs-Vorschau; Buttons „⬇ HTML-Kurs"
   (Blob-Download), „⬇ PDF" (Druckfenster wie `presentation.js#exportPdf`),
   „⬇ Markdown" (Blob-Download).

## Fehlerbehandlung

- **JSON-Robustheit:** Jede Phase parst über `cleanJson` + strikte
  Schema-Validierung; bei Fehler ein Retry, dann klare Fehlermeldung
  (Phase 1) bzw. Minimal-Fallback (Phase 2).
- **Lektions-Fehlertoleranz:** Schlägt eine Lektion nach dem Retry fehl, wird
  eine Minimal-Lektion (Titel + Lernziele + Hinweistext) eingesetzt und die
  Generierung fortgesetzt — der Kurs bricht nie komplett ab. Fehler werden
  gesammelt und am Ende zusammengefasst angezeigt.
- **Bild-Fehlertoleranz:** Schlägt ein Bild fehl, bleibt das Feld leer
  (Platzhalter), der Rest läuft weiter. Bilder werden sequenziell erzeugt, um
  den Bilddienst nicht zu überlasten.
- **Kein Zugangscode:** gleiche Meldung wie in den anderen Studios
  („Kein KI-Zugangscode gesetzt …").
- **Abbrechen:** laufende Phase-2-Generierung kann abgebrochen werden; bereits
  erzeugte Inhalte bleiben erhalten.

## Export-Formate

1. **Eigenständige HTML-Datei** — eine `.html` mit allem eingebettet
   (Theme-CSS, Bilder als Data-URL, interaktive Quizzes). Offline im Browser
   nutzbar, ideal zum Verkaufen/Hochladen. Download via Blob + `a.download`.
2. **PDF** — druckoptimiertes HTML in neuem Fenster, Browser-Druckdialog
   („Als PDF speichern"). Kein zusätzliches Bibliotheks-Dependency.
3. **Markdown** — vollständiges `.md` inkl. Quizzes und Begleitmaterial;
   Bilder als base64-Data-URI eingebettet.

## Testkonzept

`tests/course-studio.test.js` nach dem Muster von `tests/ai-agents.test.js`
(vm-Sandbox mit nachgebildeter Browser-Umgebung, um das IIFE zu laden und die
an `window.Quantum.courseStudio` exportierten reinen Funktionen zu testen):

- `cleanJson` / `parseOutline` / `parseLesson` / `parseExtras`: gültige und
  ungültige Eingaben, Begrenzungen, Defaults.
- `buildStandaloneHtml`: enthält Kurstitel, escaped HTML-Sonderzeichen,
  bindet Bild-Data-URLs und Quiz-Skript ein.
- `buildPrintHtml`: enthält Seitenumbruch-CSS und Quiz-Lösungen.
- `buildMarkdown`: korrekte Überschriften-Ebenen, Quizzes und Glossar.
- `slugify`: Sonderzeichen/Umlaute → sauberer Dateiname.

Damit die reinen Funktionen ohne DOM testbar sind, exportiert das Modul sie
zusätzlich unter `window.Quantum.courseStudio` (analog zu bestehenden Modulen,
die interne Funktionen für Tests offenlegen).

## Nicht Teil dieser Änderung (YAGNI)

- Kein In-App-Lernpfad, kein Fortschritts-Tracking, keine LMS-Funktionen.
- Kein SCORM-Export.
- Kein Drag&Drop-Umsortieren (nur hinzufügen/löschen/hoch/runter).
- Keine Server-seitige Speicherung oder Kurs-Verwaltung — die Export-Dateien
  sind das Produkt.
- Keine automatische Verkaufs-/Bezahl-Anbindung (Stripe) an einzelne Kurse.
