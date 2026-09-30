# CHRONOS 2.0.10 — comandos de moderación

- Corrige resolución de miembros PN/LID de WhatsApp Multi-Device.
- `/warn` ahora muestra 1/3, 2/3 y en 3/3 expulsa al usuario. Las advertencias manuales caducan a los 30 días.
- `/kick` verifica en vivo que CHRONOS sea admin, resuelve el identificador actual del participante, ejecuta `groupParticipantsUpdate(..., "remove")` y valida la respuesta de WhatsApp.
- `/ban` expulsa primero al miembro y registra el ban de grupo solo si la expulsión fue aceptada.
- Los comandos responden éxito o error al administrador en vez de fallar silenciosamente.
- La sincronización de grupos conserva JID de teléfono y LID como identidades alternativas del mismo miembro.
- Mejora la detección de si CHRONOS es administrador usando las identidades PN/LID reales.
- Corrige el texto de advertencias automáticas que referenciaba una variable inexistente.
- No modifica `pairing-engine.cjs`.
