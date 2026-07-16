# Presenton-Integration

## Ziel

Quantum stellt den Open-Source-Praesentationseditor Presenton als separates
Werkzeug fuer Personen mit einem Quantum-Zugangscode bereit.

## Architektur

- Presenton wird als eigener Diploi-Service mit eigener oeffentlicher URL
  betrieben; die bestehende statische Quantum-App bleibt unveraendert
  getrennt.
- Der Service verwendet das offizielle Presenton-Container-Image und einen
  persistenten Speicher fuer Entwuerfe, hochgeladene Dateien und PPTX/PDF-
  Exporte.
- Presenton nutzt einen vorhandenen Modellanbieter fuer Folientexte
  (Gemini oder OpenRouter) und kann kostenlose Stockbilder von Pexels oder
  Pixabay verwenden.
- Ein gemeinsamer Presenton-Login schuetzt den Dienst. Er wird nur an
  Personen weitergegeben, die bereits einen Quantum-Zugangscode besitzen.
- Quantum registriert einen neuen Skill `praesentation`. Dieser oeffnet die
  Presenton-URL in einem neuen Tab und beschreibt die Bearbeitungs- und
  Exportfunktionen.

## Betrieb und Kosten

- Presenton steht unter der Apache-2.0-Lizenz und darf kommerziell verwendet
  werden.
- Kosten entstehen nur durch den zusaetzlichen Diploi-Service und optionale
  Modell- oder Bildanbieter-APIs.
- Der Dienst deaktiviert die Aenderung von Anbieter-Keys in der Presenton-
  Oberflaeche, damit Nutzer keine Infrastruktur-Konfiguration einsehen oder
  aendern koennen.

## Sicherheitsgrenzen

- Der gemeinsame Login ist nur eine Zwischenloesung, solange Quantum keine
  individuellen Benutzerkonten und Abo-Berechtigungen verwaltet.
- Zugangsdaten und Modell-Keys liegen ausschliesslich in den
  Deployment-Umgebungsvariablen, nicht im Repository oder Browser-Code.
- Der Presenton-Service wird nicht in einem iframe eingebettet, sondern in
  einem neuen Tab geoeffnet, damit dessen Editor, Downloads und Anmeldung
  ohne Browser-Einschraenkungen funktionieren.

## Nicht Teil dieser Aenderung

- Individuelle Quantum-Benutzerkonten, Single Sign-On und
  nutzerbezogene Abo-Kontingente.
- Automatische API-basierte Praesentationsgenerierung direkt im Quantum-Chat.
