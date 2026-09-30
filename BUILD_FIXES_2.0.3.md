# CHRONOS 2.0.3 — Pairing page

- Restores a browser-accessible WhatsApp pairing/status page at `/`.
- The pairing code is never exposed publicly without a private `PAIRING_PAGE_TOKEN`.
- Entering the token once creates a one-hour HttpOnly/SameSite cookie and removes the token from the address bar.
- The page refreshes every 5 seconds while pairing/reconnecting.
- No changes to the working Baileys pairing handshake.
