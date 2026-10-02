# CHRONOS Backend 2.0.16 — Moderation personality sticker

Base: 2.0.15.

## Scope

This release only adds the agreed visual feedback after automatic anti-link and anti-bot actions.

### Anti-link
- First infringement: the violating message is deleted, the existing warning is registered, CHRONOS sends:
  - `Esta vez fue el mensaje.`
  - `A la próxima...`
  - then the configured CHRONOS sticker.
- Second active infringement: the user is removed using the existing kick flow, then CHRONOS sends:
  - sticker first
  - `Te lo dije. 👋` second.

### Anti-bot
- Explicitly blocked bots and behavior-detected unauthorized bots keep the existing immediate-removal behavior.
- After a successful removal CHRONOS sends:
  - `Aquí ya hay quien cuide la casa. 👋`
  - then the CHRONOS sticker.

## Safety / stability
- Pairing engine unchanged.
- WhatsApp client/listeners unchanged.
- Authentication, commands, group admin bypass, anti-link detection, anti-bot scoring and removal logic unchanged.
- Sticker send errors are non-fatal: a media-send failure cannot undo or block a completed moderation action.
