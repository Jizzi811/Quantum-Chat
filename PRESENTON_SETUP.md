# Presenton auf Railway einrichten

Quantum oeffnet Presenton ueber `/skill praesentation` in einem neuen Tab.
Presenton wird auf Railway betrieben, weil dort ein persistentes Volume fuer
Entwuerfe, Uploads und Exporte zur Verfuegung steht.

## 1. Presenton bereitstellen

1. Oeffne das offizielle Railway-Template:
   <https://railway.com/deploy/presenton-ai-presentations>
2. Starte die Bereitstellung mit dem Image `ghcr.io/presenton/presenton:latest`.
3. Setze unter **Networking** den internen Port auf `80` und erstelle eine
   oeffentliche Domain.
4. Erstelle ein Railway-Volume und mounte es auf `/app_data`.

Das Volume ist erforderlich: Presenton speichert dort Entwuerfe, Uploads,
Exporte und seine Login-Konfiguration dauerhaft.

## 2. Presenton konfigurieren

Setze in Railway diese Variablen:

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

## 3. Quantum verbinden

Kopiere die Railway-HTTPS-Domain und setze sie im Diploi-`static`-Component
unter **Options -> Environment** als `PRESENTON_URL`. Nach dem Neustart des
Components leitet `/presenton` und damit der linke Quantum-Reiter zu Presenton
weiter.

Der gemeinsame Login ist eine Zwischenloesung fuer die aktuelle
Zugangscode-Loesung und wird bei individuellen Quantum-Konten durch eine
nutzerbezogene Anmeldung ersetzt.
