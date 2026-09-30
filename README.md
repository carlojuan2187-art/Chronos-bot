# CHRONOS Backend

Backend multi-community para administración de comunidades de WhatsApp con Baileys, MongoDB y API REST.

## Servicios
- `chronos-backend`: API + WhatsApp + moderación + scheduler.
- `chronos-panel`: se construirá después y consumirá `/api/v1`.
- MongoDB Atlas: externo.

## Railway
1. Crea un Volume y móntalo en `/data`.
2. Configura `SESSION_DIR=/data/chronos-session`.
3. Copia `.env.example` a las variables del servicio y completa valores reales.
4. Build command: `npm install && npm run build`.
5. Start command: `npm start`.

La lógica de pairing preserva la corrección funcional de CHRONOS v2: versión live de WhatsApp Web, `Browsers.macOS('Chrome')` y solicitud del pairing code al recibir QR.

## Administradores
Los administradores se definen solo por `CHRONOS_PANEL_USERS` en el entorno. El panel no puede crear ni cambiar roles.

Generar password hash:
```bash
npm run hash-password -- "UnaClaveMuyFuerte"
```

Generar clave de cifrado para TOTP:
```bash
npm run generate-key
```

## Desarrollo
```bash
npm install
npm run typecheck
npm test
npm run dev
```

## API principal
- `GET /health`
- `/api/v1/auth/*`
- `/api/v1/whatsapp/*`
- `/api/v1/groups/*`
- `/api/v1/members/*`
- `/api/v1/warnings`
- `/api/v1/bans`
- `/api/v1/whitelist`
- `/api/v1/announcements/*`
- `/api/v1/schedules/*`
- `/api/v1/audit`

## Notas de seguridad
- Nunca publiques `.env`.
- `ADMIN_SECURITY_ENCRYPTION_KEY` debe ser un hex de 32 bytes (64 caracteres).
- Usa un Volume persistente para no perder la sesión de WhatsApp.
- Baileys no es una API oficial de WhatsApp; conviene mantener ritmo conservador de envíos y monitorear cambios de compatibilidad.
