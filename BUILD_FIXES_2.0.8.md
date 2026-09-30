# CHRONOS 2.0.8 — Railway Node runtime fix

## Causa
Railway/Nixpacks estaba seleccionando Node.js 18.20.5. Baileys 6.7.24 y varias dependencias requieren Node >=20.

## Corrección
- package.json: engines.node fijado a 22.x y npm >=10.
- .nvmrc: Node 22.
- No se modificó pairing-engine.cjs ni la lógica de WhatsApp.
