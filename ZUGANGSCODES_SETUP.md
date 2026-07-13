# Zugangscodes verwalten (mehrere Codes statt einem geteilten)

Statt eines einzigen, für alle geteilten Codes akzeptiert Quantum jetzt **beliebig
viele Codes**. So kannst du jedem Abonnenten einen **eigenen** Code geben und
einzelne jederzeit **entziehen oder rotieren** — ohne Code-Änderung, nur über
Netlify-Umgebungsvariablen.

## Die zwei Variablen

| Variable | Rolle |
|---|---|
| `QUANTUM_ACCESS_TOKEN` | **Master-Code** (einer). Wird auch nach erfolgreicher Zahlung automatisch freigeschaltet. Halte ihn geheim/für dich. |
| `QUANTUM_ACCESS_TOKENS` | **Deine Liste** individueller Codes, getrennt durch Komma, Semikolon oder Zeilenumbruch. Beliebig viele. |

Gültig ist ein Code, wenn er dem Master **oder** einem Eintrag der Liste entspricht.

**Beispiel** (`QUANTUM_ACCESS_TOKENS`):
```
kunde-anna-7f3a9c2e, kunde-ben-4d81b0aa, kunde-carla-9e22f10d
```

## Neuen Code vergeben
1. Einen starken, zufälligen Code erzeugen (siehe unten).
2. In Netlify → **Settings → Environment variables** → `QUANTUM_ACCESS_TOKENS` den Code
   ergänzen (mit Komma an die bestehenden anhängen).
3. Speichern → Netlify deployt automatisch neu. Danach ist der Code aktiv.
4. Den Code dem Kunden geben (er trägt ihn auf der Startseite unter „🔑 Schon dabei?" ein).

## Code entziehen (Kündigung/Missbrauch)
Den betreffenden Eintrag aus `QUANTUM_ACCESS_TOKENS` **entfernen** und speichern.
Nach dem automatischen Redeploy funktioniert genau dieser Code nicht mehr — die anderen
bleiben gültig.

## Starke Codes erzeugen
Ein Code ist einfach eine schwer zu erratende Zeichenkette. Erzeuge sie z. B. so:

- **Terminal (Mac/Linux):** `openssl rand -hex 16`
- **Node.js:** `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`
- **Browser-Konsole:** `crypto.randomUUID()`

Tipp: Ein sprechender Präfix pro Kunde hilft beim Zuordnen, z. B. `kunde-anna-<zufall>`.

## Zusammenspiel mit der Auto-Freischaltung nach Zahlung
Nach erfolgreicher Stripe-Zahlung schaltet die App automatisch mit dem **Master-Code**
(`QUANTUM_ACCESS_TOKEN`) frei. Wenn du stattdessen **pro Kunde** individuelle Codes willst,
gib die Codes aus deiner Liste gezielt selbst aus und behandle den Master-Code als deinen
eigenen Admin-Zugang. Beides funktioniert parallel.

> Hinweis: Alle Codes teilen sich denselben KI-Zugang (ein Modell-Gateway). Für echte
> Einzelkonten mit automatischer Sperre bei Kündigung bräuchte es zusätzlich Nutzerkonten
> (Stripe-Webhook + Speicher) — das ist ein größerer, separater Schritt.
