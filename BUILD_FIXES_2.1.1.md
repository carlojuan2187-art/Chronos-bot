# CHRONOS Backend 2.1.1 — Scam Guard build fix

## Corrección

- Corrige el fallo TypeScript de `src/routes/index.ts` al pasar `req.admin` a Scam Guard.
- Scam Guard ahora recibe una identidad administrativa mínima (`username`, `phone`, `role`) en lugar de exigir el `passwordHash` interno de `PanelUser`.
- No cambia la lógica de autenticación, pairing, Anti-Link, Anti-Spam, Anti-Bot ni Scam Guard.

## Archivos modificados respecto a 2.1.0

- `src/scam-guard/scam-guard.service.ts`
- `package.json`

## Archivos nuevos

- `BUILD_FIXES_2.1.1.md`
