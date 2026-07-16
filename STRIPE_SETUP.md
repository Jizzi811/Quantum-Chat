# Stripe-Abo einrichten (16,99 €/Monat)

Die Verkaufsseite nutzt **Stripe Checkout** im Abo-Modus (Karte + SEPA-Lastschrift).
Die Function `netlify/functions/checkout.js` erstellt die Checkout-Session und leitet
zur gehosteten, PCI-konformen Stripe-Seite weiter. **Es werden nie Kartendaten in
Quantum selbst eingegeben.**

## 1. Preis in Stripe anlegen
1. In [dashboard.stripe.com](https://dashboard.stripe.com) → **Produkte** ein Produkt „Quantum" anlegen.
2. Einen **wiederkehrenden Preis** hinzufügen: **16,99 € / Monat**.
3. Die **Preis-ID** kopieren (Format `price_…`).

## 2. Netlify-Umgebungsvariablen setzen
Site → **Settings → Environment variables**:

| Variable | Pflicht | Wert |
|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ | Geheimer Schlüssel (`sk_live_…` bzw. `sk_test_…`) |
| `STRIPE_PRICE_ID` | ✅ | Die Preis-ID aus Schritt 1 (`price_…`) |
| `STRIPE_PAYMENT_METHODS` | – | Default `card,sepa_debit`. PayPal: `card,sepa_debit,paypal` (erst in Stripe aktivieren) |
| `QUANTUM_ALLOWED_ORIGIN` | – | z. B. `https://quantum811.netlify.app` (Origin-Schutz) |
| `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL` | – | Überschreiben die Rücksprung-URLs (Standard: `/?checkout=success` bzw. `=cancel`) |

## 3. SEPA aktivieren
Im Stripe-Dashboard unter **Settings → Payment methods** die **SEPA-Lastschrift**
aktivieren. Karte ist standardmäßig aktiv.

## 4. Automatische Freischaltung nach Zahlung
Nach erfolgreicher Zahlung kehrt der Nutzer mit der Stripe-`session_id` zurück. Die Function
`netlify/functions/checkout-verify.js` fragt die Session bei Stripe ab und gibt — **nur wenn sie
nachweislich bezahlt/abgeschlossen ist** — den Zugangscode (`QUANTUM_ACCESS_TOKEN`) zurück.
Der Client schaltet damit automatisch frei. Kein Webhook, keine Datenbank, keine E-Mail nötig.

> Voraussetzung: `QUANTUM_ACCESS_TOKEN` (derselbe wie beim Chat) und `STRIPE_SECRET_KEY` sind gesetzt.
> Modell-Grenze: Es gibt aktuell **einen gemeinsamen Zugangscode** für alle Abonnenten (die App
> kennt keine Einzelkonten). Der Code wird nur nach einer verifizierten, bezahlten Session herausgegeben.

## 5. Testen
Mit `sk_test_…` und Stripes [Testkarten](https://stripe.com/docs/testing) (z. B. `4242 4242 4242 4242`).
Nach erfolgreicher Zahlung landet der Nutzer wieder auf der Startseite (`?checkout=success&session_id=…`)
und wird automatisch freigeschaltet.

## Offen / nächster Schritt
- **Einzelkonten:** Für pro Nutzer eigene Codes + Kündigungs-/Statusprüfung bräuchte es Nutzerkonten
  (z. B. Stripe-Webhook + Speicher/DB + E-Mail). Bewusst nicht enthalten.
- **Recht:** Impressum, Datenschutz, AGB und Widerruf unter `legal/` sind Platzhalter und
  müssen vor dem Livegang ausgefüllt werden (siehe Hinweise dort).
