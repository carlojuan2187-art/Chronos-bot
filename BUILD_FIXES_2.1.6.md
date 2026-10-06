# CHRONOS Backend v2.1.6

## Build fix

- Corrige el error TypeScript `TS2339: Property username/role does not exist on type never` introducido en v2.1.5.
- La causa era un type predicate innecesario en `canReport()` que hacía que TypeScript redujera `resolvedActor` a `never` en la rama de usuario no autorizado.
- No cambia pairing, autenticación, Anti-Link, Anti-Spam, Anti-Bot ni la lógica de enforcement de Scam Guard.
- Esta entrega se valida con `npm run build` antes de empaquetar.
