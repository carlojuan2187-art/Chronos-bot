# CHRONOS 2.1.8 — Revisión y recuperación de Scam Guard

## Diagnóstico y alcance

Se revisaron la recepción de reportes, la lista negra, las identidades PN/LID, la entrada de participantes, los barridos, la reconciliación de miembros existentes, la confirmación de expulsiones, los eventos de grupos y el worker de horarios. La captura muestra `Could not apply group schedule`, `rate-over-limit`, `err.data: 429` y un `output.statusCode: 500`. No es una prueba de que la expulsión haya fallado por falta de permisos: es una limitación de solicitudes de WhatsApp registrada por el worker de horarios.

### Causa confirmada en el código y la dependencia instalada

1. `syncGroups()` llama a `sock.groupFetchAllParticipating()`.
2. Baileys **6.7.24**, en `lib/Socket/groups.js`, emite `groups.update` dentro de esa misma consulta.
3. El listener anterior de CHRONOS llamaba a `syncGroups()` ante cualquier `groups.update`.
4. Cada consulta provocaba otra consulta completa, sin exclusión de ejecuciones simultáneas. Además, el fallback de Scam Guard hacía la misma consulta completa cuando fallaba una consulta individual.

Este ciclo es un generador verificable de solicitudes repetidas y es compatible con la saturación de la captura. Sin el servidor ni sus logs completos no se puede atribuir cada expulsión fallida únicamente a ese ciclo ni medir el bloqueo impuesto a la cuenta.

### Otros fallos encontrados

- Horarios podía ejecutar ticks superpuestos, escribir un estado que el grupo ya tenía y continuar con otros grupos después de un 429.
- El reconocimiento del límite en algunos reintentos buscaba `429` en el texto; la captura usa `rate-over-limit` y guarda el código en `data`.
- La reconciliación anterior dependía de membresías bajo un `memberId` concreto. Registros históricos separados para PN y LID podían dejar participantes sin revisar.
- Los barridos no recuperaban el teléfono guardado en el perfil cuando la metadata solo incluía LID.
- Una respuesta vacía a la expulsión se consideraba éxito. Ahora hace falta una confirmación `200` correspondiente al participante.
- Los reintentos diferidos retenían la misma cola de barridos utilizada para nuevos reportes.

### Sobre la bienvenida observada

La versión 2.1.7 adjunta ya devolvía `true` para suprimir la bienvenida cuando encontraba al reportado o no podía resolver su identidad. La captura no permite determinar por qué se vio una bienvenida en producción. Las rutas que sí la permiten son Scam Guard desactivado, lista negra vacía o identidad resuelta sin una entrada ACTIVE coincidente; también debe verificarse qué versión estaba desplegada. Se añadieron diagnósticos explícitos `SCAM_GUARD_DISABLED` y `BLACKLIST_EMPTY`. Las pruebas cubren que un reportado no reciba bienvenida incluso si su expulsión falla.

## Corrección aplicada

- Los eventos `groups.update` aplican los datos recibidos en MongoDB; no vuelven a consultar todos los grupos.
- Las sincronizaciones simultáneas comparten una única ejecución por socket.
- Una cola por socket separa las consultas/acciones de grupos y comparte el enfriamiento de 429 entre sincronización, horarios y Scam Guard. Empieza en 60 segundos y aumenta hasta 5 minutos ante límites consecutivos; una operación exitosa reinicia el contador.
- Scam Guard ya no transforma errores de metadata individual en consultas completas adicionales.
- Horarios comprueba el estado cuando aún no conoce el último aplicado, evita ticks superpuestos y pausa ante un 429.
- La reconciliación compara la lista negra con participantes reales y reutiliza la instantánea ya obtenida por la sincronización. Si la metadata omite el teléfono, consulta los alias conocidos del miembro.
- Se agrupan expulsiones simultáneas del mismo registro/grupo; se revalida que el reporte siga activo antes de enviar la acción.
- Solo una confirmación válida incrementa el contador de expulsiones y permite publicar el aviso de expulsión.
- Reintentos de grupos independientes a 1, 5, 65 y 125 segundos entre intentos; respetan el enfriamiento compartido. La sincronización periódica permite volver a revisar después, aunque se reinicie el proceso.

Se conserva Baileys 6.7.24, el stack, la base de datos y las reglas de reportes. Todos los archivos originales de `src/moderation/`, las reglas predeterminadas, permisos, comandos, autenticación y vinculación se conservaron byte por byte. No se cambió el frontend.

## Archivos exactos

Modificados:

1. `package.json` — versión 2.1.8; dependencias y comandos conservados.
2. `src/scam-guard/scam-guard.service.ts` — identificación, barridos, reintentos y confirmación.
3. `src/whatsapp/whatsapp.events.ts` — consumir actualizaciones de grupos sin recursión.
4. `src/whatsapp/whatsapp.sync.ts` — sincronización única, actualizaciones locales y reutilización de metadata.
5. `src/scheduler/group-schedule.service.ts` — evitar superposición, escrituras redundantes y reintentos durante 429.
6. `FILES.txt` — inventario actualizado.

Nuevos:

1. `src/whatsapp/group-request.service.ts`.
2. `tests/unit/group-request.test.ts`.
3. `tests/unit/whatsapp-sync.test.ts`.
4. `tests/unit/group-schedule.test.ts`.
5. `tests/unit/scam-guard-enforcement.test.ts`.
6. `REVISION_SCAM_GUARD_2.1.8.md`.

Eliminados: ninguno.

## Validación

- Suite original antes del cambio: 27 pruebas aprobadas.
- Suite final: 49 pruebas aprobadas en 9 archivos, incluyendo las 27 originales.
- Pruebas finales ejecutadas también con Node 22.23.3, la rama exigida por el proyecto.
- Compilación TypeScript y comprobación de tipos completadas.
- Casos nuevos: no recursión de sincronización, sincronización concurrente, eventos parciales, enfriamiento compartido, horarios, expulsión PN/LID, alias históricos, bienvenida de usuario permitido, rechazo 403, respuesta vacía, respuesta de otro participante, fallo de metadata 429, recuperación después de 429, reporte revocado, expulsiones simultáneas y reconciliación de miembros existentes.
- `npm run lint` no puede ejecutarse correctamente: el ZIP original incluye ESLint 9 pero no incluye `eslint.config.js/mjs/cjs`. Se conserva ese problema previo; no se afirma que lint haya pasado.
- Las pruebas de WhatsApp y MongoDB usan dobles controlados. No se accedió a la cuenta real, al servidor Railway ni a MongoDB de producción; falta la comprobación real posterior al despliegue.

## Ejecutar y probar localmente

Usar Node 22 y las variables actuales del proyecto, o `.env.example` con valores propios para una instancia de prueba:

```bash
npm install --include=dev
npm run typecheck
npm test
npm run build
npm start
```

El paquete original no tiene lockfile; se conservó esa situación y no se cambiaron versiones de dependencias. `dist/` y `node_modules/` se generan al instalar/compilar y no se incluyen en el ZIP.

## Desplegar en Railway

1. Actualizar el código del backend con el contenido del ZIP. Mantener la base MongoDB, las variables y el volumen de sesión existentes.
2. Desplegar el mismo servicio del backend. El `railway.toml` ya contiene `npm install --include=dev && npm run build` y `npm start`.
3. Confirmar que el arranque corresponde a `chronos-backend@2.1.8`, `/health` responde y WhatsApp está conectado.
4. Comprobar que `Groups synchronized` ya no aparece en un ciclo continuo: debe corresponder al arranque, reconexiones, solicitudes manuales o al intervalo configurado.
5. Verificar en el panel que Scam Guard está habilitado y que el teléfono esperado, con código de país, está ACTIVE. Para revisar usuarios que ya estaban dentro, `scanExistingGroups` debe estar activado.
6. Confirmar que CHRONOS es administrador del grupo. Una prueba controlada con una cuenta propia no administrativa, reportada desde el panel, permite verificar expulsión al entrar y expulsión si ya estaba dentro. Retirar luego ese reporte de prueba con OWNER.
7. Confirmar `Scam Guard removed blacklisted participant` y `SCAM_GUARD_PERMANENT_BAN_ENFORCED`, y verificar físicamente la salida del grupo. La cuenta reportada no debe recibir bienvenida. Otro usuario no reportado debe conservar la bienvenida normal.

Variables nuevas: ninguna. Variables a eliminar: ninguna. Migraciones: ninguna. No borrar la sesión ni la lista negra para aplicar esta corrección.

## Límites reales

- WhatsApp puede mantener un límite temporal después del despliegue. El código debe esperar; no puede garantizar expulsión instantánea mientras el proveedor rechace solicitudes.
- Si WhatsApp solo entrega un LID y no existe ninguna relación comprobada con el teléfono, no se inventa una identidad ni se expulsa a una persona al azar: se suprime la bienvenida y se vuelve a revisar.
- La revisión periódica de miembros existentes usa `GROUP_SYNC_INTERVAL_MINUTES` (15 minutos por defecto) y respeta `scanExistingGroups`.
- Las colas y la exclusión mutua son por proceso/socket. Este backend con una sola sesión de WhatsApp debe operar en una única réplica activa; esta entrega no implementa coordinación entre varias réplicas.
- Si reaparece una bienvenida inesperada, guardar los logs desde `Scam Guard evaluating joined participant` y los motivos de omisión, junto con la versión desplegada y el estado ACTIVE del reporte. Eso permitirá distinguir configuración, identidad y rechazo del proveedor.
