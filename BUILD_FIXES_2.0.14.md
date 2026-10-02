# CHRONOS Backend v2.0.14

Base: v2.0.13 stable.

## Cambios
- Los administradores reales de WhatsApp del grupo pueden quedar exentos del anti-link.
- Los administradores de la comunidad padre de WhatsApp también pueden quedar exentos cuando `linkedParent` está disponible.
- El bypass de administradores de WhatsApp aplica solo al anti-link; no concede permisos del panel ni de comandos CHRONOS.
- Nuevo control por grupo `antiLink.detectBareDomains` para separar dominios desnudos de HTTP/HTTPS.
- Controles existentes de enlaces WhatsApp, Telegram, teléfonos y ofuscación siguen siendo independientes por grupo.
- Nuevo control `antiSpam.detectMassMentions` para permitir/desactivar el bloqueo por menciones masivas en grupos concretos.
- Compatibilidad con grupos ya existentes: si `detectBareDomains` aún no está guardado, hereda `detectHttpLinks`; los admins de grupo/comunidad quedan permitidos por defecto.

## No tocado
- pairing-engine.cjs
- flujo de pairing
- SESSION_DIR
- WhatsApp reconnect/client
- autenticación del panel
- comandos /warn, /kick, /ban
