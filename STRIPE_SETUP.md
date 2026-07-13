# Stripe-Abo einrichten (11,99 €/Monat)

Die Verkaufsseite nutzt **Stripe Checkout** im Abo-Modus (Karte + SEPA-Lastschrift).
Die Function `netlify/functions/checkout.js` erstellt die Checkout-Session und leitet
zur gehosteten, PCI-konformen Stripe-Seite weiter. **Es werden nie Kartendaten in
Quantum selbst eingegeben.**

## 1. Preis in Stripe anlegen
1. In [dashboard.stripe.com](https://dashboard.stripe.com) → **Produkte** ein Produkt „Quantum" anlegen.
2. Einen **wiederkehrenden Preis** hinzufügen: **11,99 € / Monat**.
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

## 4. Testen
Mit `sk_test_…` und Stripes [Testkarten](https://stripe.com/docs/testing) (z. B. `4242 4242 4242 4242`).
Nach erfolgreicher Zahlung landet der Nutzer wieder auf der Startseite (`?checkout=success`).

## Offen / nächster Schritt
- **Zugang freischalten:** Aktuell zeigt die Erfolgsseite den Hinweis, dass der Zugangscode
  per E-Mail kommt. Das automatische Ausstellen/Verwalten des Codes nach erfolgreicher Zahlung
  (Stripe-Webhook → Zugangscode) ist ein sinnvoller Folgeschritt.
- **Recht:** Impressum, Datenschutz, AGB und Widerruf unter `legal/` sind Platzhalter und
  müssen vor dem Livegang ausgefüllt werden (siehe Hinweise dort).
