# CHRONOS 2.0.6 — pairing QR estable

## Objetivo
Restaurar el flujo de vinculación tomando como referencia directa `Chronos-bot-pairing-fix-v2`, la versión que sí vinculó en Railway.

## Cambios
- El QR de Baileys vuelve a ser el método principal y no se altera automáticamente con `requestPairingCode()`.
- El código por número se genera solo bajo petición explícita desde la página protegida.
- La página `/` muestra un QR escaneable generado localmente en el backend.
- Los listeners de moderación/MongoDB se registran únicamente después de `connection=open`.
- QR y pairing code se invalidan inmediatamente al cerrarse el socket.
- Se conserva el flujo conocido de versión WA Web, auth state, browser `Browsers.macOS('Chrome')`, limpieza de sesión parcial y política de reconexión de la versión funcional.

## Archivos modificados
- `src/whatsapp/whatsapp.client.ts`
- `src/whatsapp/state.ts`
- `src/system/pairing.routes.ts`
- `src/server.ts`
- `package.json`

## Archivo añadido
- `BUILD_FIXES_2.0.6.md`
