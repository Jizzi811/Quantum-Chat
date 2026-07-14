# Websuche & Web-Reader für Quantum

Zwei Werkzeuge geben Quantum Zugriff aufs Web. Das aktive KI-Modell
(z. B. Hermes, siehe `NOUS_SETUP.md`) wertet die Ergebnisse aus.

## `/skill browse <url>` — eine Seite lesen

Lädt eine öffentliche Seite, extrahiert den Text und lässt das Modell sie
zusammenfassen oder Fragen beantworten. **Kein Zusatz-Key nötig.**

```
/skill browse https://example.com
/skill browse https://example.com | Worum geht es? Was kostet es?
```

## `/skill websuche <frage>` — im Web suchen

Findet passende Seiten über [Tavily](https://tavily.com) und lässt das Modell
daraus eine Antwort mit Quellenangaben bauen.

### Einrichtung

1. Kostenlosen API-Key erstellen: <https://app.tavily.com> → **API Keys**.
2. In Netlify unter **Project configuration → Environment variables** setzen:
   - `TAVILY_API_KEY`: der Key aus Schritt 1 (Pflicht für die Websuche)
   - `QUANTUM_ACCESS_TOKEN`: derselbe Zugangscode wie beim Chat (Pflicht)
   - `QUANTUM_ALLOWED_ORIGIN`: optional, exakte öffentliche URL
3. Site neu deployen.

```
/skill websuche Wann startet die nächste SpaceX-Mission?
```

Ohne `TAVILY_API_KEY` meldet die Websuche, dass sie nicht konfiguriert ist —
`/skill browse` funktioniert davon unabhängig weiter.

## Sicherheit

Beide Functions verlangen denselben Zugangscode wie der Chat, haben ein
Rate-Limit (10 Anfragen/Minute) und ein Zeitlimit. Der Web-Reader blockt
zusätzlich interne Adressen (localhost, private Netze, Cloud-Metadaten-IP),
akzeptiert nur `http(s)` und liest nur Text-Inhalte.
