# CHRONOS 2.0.7 — exact CommonJS pairing engine

This release isolates WhatsApp registration from the modular backend.

- Added `pairing-engine.cjs`, using CommonJS `require()` and the same Baileys registration sequence as the build that previously paired successfully.
- Phone-code pairing is automatic again after Baileys emits the registration QR (`WHATSAPP_PAIRING_MODE=code`, default).
- QR mode remains available with `WHATSAPP_PAIRING_MODE=qr`, but the two methods are never mixed in the same registration attempt.
- Removed the manual `/pairing/code` endpoint that could surface a generic `INTERNAL_ERROR`.
- Added a protected `/pairing/reset` action to clear the partial session and start a fresh registration.
- MongoDB, group sync, moderation and schedulers are started only after WhatsApp reports `connection=open`.
- Removed the Node 22 pin so Railway uses the same default Node runtime family as the known-good simple build.
