# Echte Video-Generierung für Quantum (LongCat-Video via fal.ai)

`/skill video-real <beschreibung>` erzeugt ein **echtes KI-Video** aus Text —
über das offene Modell **LongCat-Video** (Meituan, MIT-Lizenz) gehostet auf
[fal.ai](https://fal.ai). 720p, 30 fps.

> ⚠️ **Nicht kostenlos.** Das Modell ist frei, die Rechenzeit bei fal kostet
> **~$0.04 pro erzeugter Videosekunde** (ein 8-Sekunden-Clip ≈ $0.32).
> Ohne `FAL_KEY` ist die Funktion inaktiv — es entstehen keine Kosten.

## Einrichtung

1. Account + Key erstellen: <https://fal.ai/dashboard/keys>.
2. In Netlify unter **Project configuration → Environment variables** setzen:
   - `FAL_KEY`: der Key aus Schritt 1 (Pflicht für die Video-Generierung)
   - `QUANTUM_ACCESS_TOKEN`: derselbe Zugangscode wie beim Chat (Pflicht)
   - `QUANTUM_ALLOWED_ORIGIN`: optional, exakte öffentliche URL
3. Site neu deployen.

## Nutzung

```
/skill video-real Ein Fuchs läuft durch einen verschneiten Neonwald, Kamerafahrt
```

Der Ablauf ist zweistufig (fal rendert in einer Queue):

1. Der Skill sendet den Prompt ab und pollt ~2 Minuten lang den Status.
2. Ist das Video früh fertig, erscheint direkt der Link.
3. Dauert es länger, bekommst du eine **Auftrags-ID** und prüfst später:

```
/skill video-status <auftrags-id>
```

Ohne `FAL_KEY` meldet der Skill, dass die Video-Generierung nicht konfiguriert
ist. Das bestehende **Video-Studio** (`/skill video`, Remotion, kostenlos) und
alle anderen Skills laufen davon unabhängig weiter.

## Sicherheit & Kosten-Schutz

Die Function `video-real` verlangt denselben Zugangscode wie der Chat, hat ein
Rate-Limit (20 Anfragen/Minute) und ein Zeitlimit. Der `FAL_KEY` bleibt
**serverseitig** und wird nie an den Browser gegeben. Auftrags-IDs werden
streng validiert (nur UUID-artige Zeichen), bevor sie in eine fal-URL fließen.
Da jede Generierung Geld kostet, wird sie **nur** durch einen ausdrücklichen
`/skill video-real`-Aufruf ausgelöst.
