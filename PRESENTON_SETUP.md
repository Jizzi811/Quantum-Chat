# Presenton einrichten

Presenton laeuft als eigener Diploi-Service und wird in Quantum ueber
`/skill praesentation` geoeffnet.

## 1. Infrastruktur anwenden

Nachdem `diploi.yaml` uebernommen wurde, erscheint ein zweiter Component mit
der Kennung `presenton`. Oeffne dessen oeffentlichen Endpoint und kopiere die
vollstaendige HTTPS-URL.

## 2. Quantum-Weiterleitung setzen

Im `static`-Component unter **Options -> Environment** setzen:

| Variable | Wert |
| --- | --- |
| `PRESENTON_URL` | Die oeffentliche HTTPS-URL des `presenton`-Components |

Damit fuehrt der Quantum-Skill ueber `/presenton` zum Editor. Nach einer
Umgebungsvariablen-Aenderung den Component neu starten.

## 3. Presenton konfigurieren

Im `presenton`-Component unter **Options -> Environment** setzen:

| Variable | Wert |
| --- | --- |
| `LLM` | `openrouter` |
| `OPENROUTER_API_KEY` | Dein vorhandener OpenRouter-Key |
| `OPENROUTER_MODEL` | z. B. `openrouter/free` |
| `IMAGE_PROVIDER` | `pixabay` oder leer lassen |
| `PIXABAY_API_KEY` | Optionaler Pixabay-Key fuer Stockbilder |
| `CAN_CHANGE_KEYS` | `false` |
| `AUTH_USERNAME` | Gemeinsamer Benutzername fuer freigeschaltete Quantum-Nutzer |
| `AUTH_PASSWORD` | Starkes gemeinsames Passwort mit mindestens 6 Zeichen |
| `DISABLE_ANONYMOUS_TRACKING` | `true` |

Presenton speichert Entwuerfe und Exporte im persistenten Component-Speicher.
Der gemeinsame Login ist fuer die aktuelle Zugangscode-Loesung gedacht und
wird bei individuellen Quantum-Konten durch eine nutzerbezogene Anmeldung
ersetzt.
