# CHRONOS 2.0.18 — rate-limit safe moderation

Base: exact repository supplied by the user (2.0.15).

Changes:
- Group schedule worker no longer applies default OPEN state to every group on startup.
- A WhatsApp 429/rate-overlimit pauses schedule actions with exponential backoff and stops the current group loop.
- Schedule changes are serialized with a short delay.
- Automatic message deletion failures are now logged instead of swallowed.
- Bot-access lookup failures no longer abort the automatic moderation pipeline; anti-link can continue.

Untouched:
- pairing-engine.cjs
- src/whatsapp/whatsapp.client.ts
- src/whatsapp/whatsapp.events.ts
- src/moderation/anti-link.service.ts
- commands and authentication
