# CHRONOS backend v2.1.3 — Scam Guard trusted-source capture fix

## Correcciones
- Corrige la resolución OWNER/ADMIN en grupos que entregan al remitente como LID sin `participantPn`.
- Scam Guard ahora resuelve la identidad en tres niveles: PN del mensaje, caché de miembros y metadata real del grupo.
- Amplía la lectura del texto para mensajes envueltos/reenviados (`ephemeral`, `viewOnce`, `documentWithCaption`, `edited`) y captions.
- Un reporte reconocible en una fuente confiable ya no se ignora silenciosamente si no puede identificar al autor: deja auditoría, log y aviso en el grupo.
- Añade logging explícito cuando un reporte confiable es detectado y aceptado.

## No modificado
- `pairing-engine.cjs`
- autenticación del panel
- Anti-Link
- Anti-Spam
- Anti-Bot
- scheduler
