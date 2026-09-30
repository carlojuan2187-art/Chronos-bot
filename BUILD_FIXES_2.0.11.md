# CHRONOS 2.0.11 — WhatsApp listener reconnect fix

## Causa
Los listeners operativos de WhatsApp se marcaban como registrados con un boolean global. Cuando Baileys reemplazaba el socket durante una reconexión, el nuevo socket quedaba conectado pero sin `messages.upsert`, por lo que los comandos y la moderación dejaban de responder.

## Corrección
- Se sustituye el boolean por la referencia `listenersSocket`.
- Cada socket nuevo recibe `registerWhatsAppEvents(sock)`.
- Se conserva una única registración por socket para evitar listeners duplicados.
- Se añade log `WhatsApp command/moderation listeners registered` al activar cada socket.
- No se modifica `pairing-engine.cjs`.
