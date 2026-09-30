# CHRONOS 2.0.4 — Pairing stabilization

Changes:
- Pairing socket is no longer exposed to schedulers/group sync/moderation until WhatsApp reports `connection=open`.
- Operational WhatsApp event handlers are registered only after the account is fully connected.
- Pairing code is cleared immediately when its socket closes, preventing stale codes on the pairing page.
- Railway logs now print the pairing code and disconnect status directly in the text line.
- `restartRequired` (515) is handled explicitly: registered credentials are preserved; incomplete pairing state is cleared.
- Node.js is pinned to 22.x LTS.
- Duplicate Mongoose TTL index warnings were removed.

The Baileys version, browser identity, live WA-Web version lookup, phone pairing flow, session directory and public pairing page remain compatible with the previously working CHRONOS pairing implementation.
