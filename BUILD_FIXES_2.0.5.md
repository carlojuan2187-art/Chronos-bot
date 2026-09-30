# CHRONOS 2.0.5 — exact pairing rollback

## Root cause strategy
The modular backend had progressively changed the WhatsApp registration callback around a component that was already proven to work. This release restores the pairing/registration semantics from `Chronos-bot-pairing-fix-v2` as literally as possible while retaining the modular backend after connection.

## Changes
- Restored no-argument `fetchLatestWaWebVersion()` invocation using a TypeScript compatibility cast.
- Restored the exact known-good browser and socket options.
- Restored the exact QR-gated single `requestPairingCode()` flow.
- Restored the known-good disconnect policy: do not clear credentials on 515.
- Removed MongoDB/SystemState work from the registration callback.
- Operational WhatsApp listeners are attached in the same ordering as the known-good build.
- Pairing code remains available through the protected pairing page and is also printed directly in Railway logs.

## Not changed
MongoDB models, API, moderation rules, auth, scheduler, announcements, and panel API remain intact.
