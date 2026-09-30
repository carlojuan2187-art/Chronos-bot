# CHRONOS backend 2.0.1 — build fixes

Correcciones aplicadas tras el primer build real en Railway:

1. `pino-http`: se usa el export nombrado `pinoHttp`, compatible con sus definiciones TypeScript en ESM/NodeNext.
2. Express route params: se añadió `routeParam()` para validar y estrechar los parámetros de ruta antes de pasarlos a servicios que requieren `string`.
3. Baileys 6.7.24: `fetchLatestWaWebVersion` recibe explícitamente `{}` porque en esta versión su firma requiere un argumento `AxiosRequestConfig`.
4. Tipos de Express: `@types/express` se alinea a la rama 4.x, igual que `express@4.21.x`.

No se modificó la lógica de pairing que ya vinculó correctamente WhatsApp.
