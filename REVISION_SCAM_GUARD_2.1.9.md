# CHRONOS 2.1.9 — Coincidencia de números mexicanos

## Evidencia de este incidente

El log aportado registra, a las 04:14:27 UTC del 6 de octubre:

- `Scam Guard evaluating joined participant`.
- Identidad resuelta como un teléfono mexicano con prefijo `521`.
- `Scam Guard join cleared`.

Esto significa que el flujo no encontró una entrada ACTIVE para el teléfono exacto y permitió seguir hacia la bienvenida. No fue un intento de expulsión rechazado en ese punto. El usuario confirmó después que una prueba con un número cubano sí expulsaba correctamente, acotando el incidente a México.

El código anterior usaba igualdad literal. Un reporte con `52` y diez dígitos nacionales no coincidía con la identidad de WhatsApp `521` y esos mismos diez dígitos. No se tiene acceso a MongoDB de producción para leer el valor original del reporte; la incompatibilidad está reproducida en las pruebas.

Referencia primaria sobre el formato mexicano de WhatsApp: https://faq.whatsapp.com/640432094208718/

El archivo también contiene arranques `chronos-backend@2.1.7` junto con mensajes introducidos en la corrección posterior. Esto es compatible con una actualización parcial o con diferencias entre el código y la versión declarada; no demuestra por sí solo qué fuentes se desplegaron. Por eso se incorpora una huella de compilación verificable.

## Cambios

- Scam Guard reconoce como equivalentes únicamente `52` + 10 dígitos y `521` + esos mismos 10 dígitos, en ambas direcciones.
- La equivalencia se usa al buscar reportes activos, registrar reportes existentes, identificar miembros en barridos y validar el participante antes de expulsarlo.
- Se aplica también a la protección del número del bot y de los administradores configurados y a la identificación del autor dentro de Scam Guard.
- No se comparan solo los últimos dígitos, no se adivina el país y no se transforma un LID en un teléfono.
- Cuba y los demás países conservan su comparación exacta. Se añadió una prueba explícita de expulsión de número cubano.
- Se conserva el formato de reportes y su parser de 2.1.8. Aunque durante la revisión se detectó otra limitación para listas en varias líneas, ese cambio se dejó fuera al confirmarse que este incidente es específico de México.
- Los errores operativos de Scam Guard y horarios incluyen código y motivo en el texto exportado, además de los campos estructurados. El log recibido no contiene esos detalles en las líneas `Could not apply group schedule`, por lo que no permite identificar su código actual.
- Horarios reduce los reintentos también para errores diferentes de 429. Las operaciones de grupos no se envían a un socket cerrado. Se mantienen las correcciones de sincronización y enfriamiento de 2.1.8.
- La compilación genera `dist/build-info.json` después de reconstruir `dist`. El arranque y `/health` muestran versión y huella. En producción, un build sin ese archivo falla con una instrucción explícita de compilar.

No se modificaron enlaces, advertencias, anti-spam, anti-bot, comandos, autenticación, reglas predeterminadas ni vinculación. Tampoco se modificó el frontend. No se añadieron dependencias.

## Despliegue

1. Actualizar el backend con el ZIP completo, incluyendo `package.json`, `scripts/build.mjs` y los archivos nuevos. Mantener las variables, MongoDB y la sesión.
2. Dejar el build de Railway en `npm install --include=dev && npm run build` y el inicio en `npm start`, tal como ya figura en `railway.toml`.
3. Confirmar en el arranque `CHRONOS runtime version=2.1.9 build=c9a0d868f6c040a1 scamGuard=phone-alias-v2`.
4. Comprobar que `/health` devuelve `version: "2.1.9"` y `build: "c9a0d868f6c040a1"`. La huella identifica el código exacto de esta entrega; una modificación posterior de fuentes cambia la huella.
5. Mantener Scam Guard habilitado y el reporte mexicano en estado ACTIVE. No es necesario duplicarlo ni cambiar manualmente el `52` por `521`.
6. Repetir la prueba mexicana: esperar coincidencia, confirmación de expulsión y ausencia de bienvenida. Con `scanExistingGroups` activo, la sincronización también revisa a quien ya esté dentro. No registrar como estafador a un usuario ajeno solo para probar.
7. Si no existe un reporte activo, registrarlo desde el panel o reenviar el reporte habitual a la fuente confiable y comprobar la confirmación. Esta entrega no inventa reportes a partir del log.

Variables nuevas: ninguna. Variables eliminadas: ninguna. Migraciones: ninguna. No borrar sesión ni base de datos.

## Ejecutar y probar

Con Node 22:

```bash
npm install --include=dev
npm run typecheck
npm test
npm run build
npm start
```

Pruebas: 63 aprobadas en 11 archivos; incluye México en ambas direcciones, barrido de usuario existente, reporte recibido por WhatsApp seguido de ingreso con otro formato, Cuba, límites de API, rechazo de expulsiones y las pruebas originales de moderación. Compilación y tipos comprobados con Node 22. Las pruebas de WhatsApp/MongoDB usan dobles; no se ha desplegado ni ejecutado una expulsión real desde este entorno.

El problema previo de ESLint sigue siendo que el proyecto original no aporta `eslint.config.*`; no se afirma una validación de lint satisfactoria.

## Límites

- La evidencia nueva descarta que el error de horarios impida todas las expulsiones: la prueba cubana funciona. El error de horarios y la falta de coincidencia mexicana deben diagnosticarse por separado.
- No se puede afirmar que todos los errores del servidor desaparezcan: el nuevo log mostrará su código real y evita repetirlos cada 30 segundos sin pausa.
- Se requiere que el bot tenga permisos de administrador y que WhatsApp acepte la expulsión. Un 429 mantiene su espera de recuperación.
- Los reportes existentes se conservan sin migración ni fusión. Si ya se registraron manualmente dos entradas equivalentes, ambas se muestran en el panel; para retirar completamente esa sanción deben revocarse las dos entradas activas.
- El backend conserva el diseño de una réplica activa por sesión de WhatsApp.

## Archivos exactos respecto a 2.1.8

Modificados:

```text
FILES.txt
package.json
src/scam-guard/scam-guard.service.ts
src/scheduler/group-schedule.service.ts
src/server.ts
src/system/health.routes.ts
src/whatsapp/group-request.service.ts
tests/unit/group-request.test.ts
tests/unit/group-schedule.test.ts
tests/unit/scam-guard-enforcement.test.ts
```

Nuevos:

```text
REVISION_SCAM_GUARD_2.1.9.md
scripts/build.mjs
src/scam-guard/scam-identity.ts
src/system/build-info.ts
src/utils/error-summary.ts
tests/unit/error-summary.test.ts
tests/unit/scam-identity.test.ts
```

Eliminados: ninguno. Las correcciones anteriores de `src/whatsapp/whatsapp.events.ts` y `src/whatsapp/whatsapp.sync.ts` siguen incluidas en este ZIP completo.
