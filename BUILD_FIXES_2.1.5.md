# CHRONOS Backend 2.1.5 — Scam Guard Join Enforcement Fix

- Corrige la expulsión de números ya incluidos en Scam Guard cuando WhatsApp entrega el alta del participante como LID.
- Resuelve LID↔PN consultando caché y metadata del grupo con reintentos cortos.
- Evita dar la bienvenida a un número confirmado en blacklist aunque la metadata de WhatsApp esté temporalmente retrasada.
- Si el número está confirmado pero la expulsión inmediata no se completa, encola reconciliación automática.
- La comprobación de admin ya no cancela prematuramente la expulsión cuando el grupo persistido confirma que CHRONOS es administrador.
- Añade logs explícitos para join detectado, match de blacklist y expulsión.
- No modifica pairing, login, 2FA, Anti-Link, Anti-Spam ni Anti-Bot.
