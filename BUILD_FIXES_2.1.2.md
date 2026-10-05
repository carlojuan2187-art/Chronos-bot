# CHRONOS Backend v2.1.2 — Production recovery fix

- MongoDB now connects independently from WhatsApp pairing, so panel authentication remains available even while WhatsApp is disconnected or waiting for pairing.
- Scam Guard no longer imports the WhatsApp client module directly; the live socket is injected into Scam Guard operations. This removes the circular dependency between whatsapp.client -> whatsapp.events -> scam-guard -> whatsapp.client.
- Pairing engine, auth service, token service and WhatsApp client pairing code are preserved byte-for-byte from the known-good v2.0.15 base except for the event integration required by Scam Guard.
- No environment variables were added or changed.
