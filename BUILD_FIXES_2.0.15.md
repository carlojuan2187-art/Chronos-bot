# CHRONOS Backend v2.0.15 — Anti-Bot quirúrgico

Base: v2.0.14 estable.

## Implementado
- Anti-Bot por grupo, desactivado por defecto.
- Detección de advertencias automáticas, lenguaje de moderación automatizada y firmas personalizadas.
- Allowlist/blocklist de bots por GLOBAL / COMMUNITY / GROUP.
- Bots autorizados pueden omitir Anti-Bot, Anti-Link, Anti-Spam y contenido bloqueado según configuración.
- Bots bloqueados se eliminan cuando envían un mensaje en un grupo cubierto por su regla.
- Auditoría de detección y expulsión Anti-Bot.
- Nuevo permiso `bots.manage` para OWNER y ADMIN.

## Congelado / no modificado
- `pairing-engine.cjs`
- `src/whatsapp/whatsapp.client.ts`
- `src/whatsapp/whatsapp.events.ts`
- flujo de pairing, sesión y reconexión
- comandos existentes

## Despliegue seguro
1. Desplegar backend/panel.
2. Registrar primero los bots legítimos en Bots.
3. Activar Anti-Bot únicamente en los grupos deseados.

No requiere nuevas variables de entorno.
