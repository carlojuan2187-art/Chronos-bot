# CHRONOS Backend v2.1.0 — Scam Guard

Base: **v2.0.15 Anti-Bot**, confirmada operativa antes de este cambio.

## Nuevo: Scam Guard
- Fuente privada de reportes configurable por JID de grupo/canal.
- Solo `OWNER` y `ADMIN` de `CHRONOS_PANEL_USERS` pueden generar reportes confiables.
- Captura de reportes con `/report`, texto natural con palabras de reporte/estafa/fraude/scam o un número solo dentro de la fuente confiable.
- Lista negra global permanente por número normalizado.
- Creación/uso de ban GLOBAL para impedir reingreso.
- Barrido serial de todos los grupos donde CHRONOS es administrador al registrar un número.
- Detección en `group-participants.update` para expulsión inmediata al intentar entrar.
- Reconciliación después de sincronizar grupos para cubrir entradas ocurridas durante desconexiones.
- Aviso público tras expulsión con número parcialmente oculto.
- Protección contra bloquear el número principal de CHRONOS o un OWNER/ADMIN/MODERATOR configurado.
- Duplicados se consolidan en una sola entrada; cada reporte queda en historial.
- Solo OWNER puede retirar el bloqueo de Scam Guard.
- Auditoría de reportes, expulsiones, fallos y revocaciones.

## Configuración
No se agregan variables de entorno obligatorias.

La fuente puede registrarse desde el panel o, desde la cuenta OWNER, enviando dentro del chat fuente:

```text
/scam-source
```

## Importante
- Pairing, `pairing-engine.cjs`, socket base y lógica Anti-Link/Anti-Spam/Anti-Bot no fueron sustituidos.
- El barrido usa una cola serial con pausa configurable (900 ms por defecto) para evitar ráfagas de acciones de grupo.
