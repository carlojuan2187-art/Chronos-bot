# Estado de implementación — CHRONOS Backend 2.1

## Implementado
- TypeScript modular.
- MongoDB/Mongoose.
- Pairing/reconexión de WhatsApp basado en la v2 que vinculó correctamente.
- Soporte de `SESSION_DIR` para Railway Volume.
- Sincronización automática de grupos.
- Perfil/configuración independiente por grupo.
- Comunidades con asignación manual segura cuando WhatsApp no expone relación fiable.
- Roles globales OWNER / ADMIN / MODERATOR desde variables de entorno.
- Login con Argon2id, JWT corto, refresh rotativo y sesiones revocables.
- TOTP 2FA obligatorio para OWNER/ADMIN por flujo de preautenticación.
- Anti-link: primera infracción advertencia; segunda activa kick; expiración configurable.
- Detección de enlaces HTTP, WhatsApp, Telegram, teléfonos y formas ofuscadas.
- Anti-spam flexible con duplicados, burst, multimedia y menciones.
- Palabras/contenido bloqueado.
- Whitelist granular.
- Warnings, kick y bans de grupo/comunidad/global en modelo de datos/API.
- Bienvenida por grupo.
- Reglas y horarios por grupo.
- Apertura/cierre manual y worker de horario automático.
- Comandos de WhatsApp básicos (`/reglas`, `/horario`, `/warn`, `/kick`, `/ban`, `/warnings`, `/status`).
- Anuncios y scheduler persistidos en MongoDB.
- Dispatch idempotente por ejecución/grupo.
- Texto, imagen, video y documento mediante URL HTTPS.
- Audit/modelos de eventos, processed message TTL e idempotency model.
- Healthcheck y configuración Railway.
- Pruebas unitarias iniciales para permisos y detección anti-link.

## Verificación realizada
- Se revisó la estructura y se ejecutó el parser de TypeScript sobre todo `src/` mediante `tsc --noResolve`.
- No quedan errores sintácticos de TypeScript detectados.
- El ZIP final se valida con `unzip -t` antes de entrega.

## Verificación pendiente por limitación del entorno
El entorno de construcción no pudo alcanzar `registry.npmjs.org`, por lo que `npm install` expiró. Por esa razón no se pudo ejecutar una compilación completa con las dependencias reales ni `vitest` en esta sesión. En Railway, donde npm tenga acceso a Internet, ejecutar:

```bash
npm install
npm run typecheck
npm test
npm run build
```

No se afirma que el deploy final esté verificado hasta completar esos comandos con dependencias instaladas y conectar un MongoDB/WhatsApp reales.


## v2.0.15
Anti-Bot agregado de forma aislada al pipeline de moderación. Pairing/socket/listeners permanecen congelados. Anti-Bot queda OFF por defecto hasta autorizar bots legítimos y activarlo por grupo.

## v2.1.0 — Scam Guard
- Fuente de reportes privada configurable.
- Reportes confiables limitados a OWNER/ADMIN de plataforma.
- Blacklist global permanente por teléfono.
- Barrido inmediato serial de grupos protegidos.
- Bloqueo de reingreso mediante evento de participantes.
- Reconciliación posterior a sincronización completa.
- Mensaje público al expulsar.
- Panel/API para configuración, consulta, alta manual y revocación OWNER.

## v2.1.2 — Production recovery
- MongoDB se conecta al arrancar de forma independiente al estado de WhatsApp; el login del panel no queda bloqueado por pairing/desconexión.
- Scam Guard recibe el socket por inyección y deja de importar `whatsapp.client.ts`, eliminando la dependencia circular del runtime.
- `pairing-engine.cjs`, `whatsapp.client.ts`, `auth.service.ts`, `token.service.ts`, `env.ts` y `app.ts` permanecen byte-for-byte iguales a v2.0.15.
- Sin variables de entorno nuevas.


## v2.1.3
Scam Guard: corrección de captura desde grupo privado cuando WhatsApp entrega identidad LID; soporte adicional para mensajes reenviados/envueltos y diagnóstico explícito de reportero no reconocido.
