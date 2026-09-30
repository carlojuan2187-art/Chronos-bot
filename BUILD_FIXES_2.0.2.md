# CHRONOS backend 2.0.2 — Railway build fix

## Síntoma
Railway ejecutaba `npm install` con `NODE_ENV=production`, por lo que npm omitía `devDependencies`. Después `npm run build` fallaba con `tsc: not found` porque TypeScript está correctamente clasificado como dependencia de desarrollo.

## Causa
El build de Railway necesita las dependencias de desarrollo para compilar TypeScript aunque el runtime se ejecute con `NODE_ENV=production`.

## Solución
Se cambió `railway.toml` para instalar explícitamente las dependencias de desarrollo durante la fase de build:

`npm install --include=dev && npm run build`

El comando de arranque continúa siendo `npm start`, por lo que la aplicación sigue ejecutándose en producción.

## Archivos modificados
- `railway.toml`
- `package.json` (versión 2.0.2)

No se modificó la lógica de WhatsApp, pairing, moderación ni API.
