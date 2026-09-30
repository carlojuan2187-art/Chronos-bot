# CHRONOS 2.0.9 — WhatsApp admin identity fix

## Root cause
WhatsApp Multi-Device can deliver group participants using an internal LID JID (`@lid`) instead of the phone-number JID. CHRONOS was authorizing commands by converting `msg.key.participant` directly to digits and comparing that value with `CHRONOS_PANEL_USERS[].phone`. When `participant` was a LID, a valid OWNER/ADMIN/MODERATOR was incorrectly treated as unauthorized.

## Fix
- Prefer Baileys `participantPn` and `senderPn` for phone-based authorization.
- Fall back to `participant` and `remoteJid` only for older message shapes.
- Apply the same identity resolution to the moderation bypass for configured administrators.
- No pairing, session, scheduler, API or moderation policy logic was changed.
