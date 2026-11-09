## Qué cambia y por qué

<!-- Qué problema resuelve (ID del plan: H…, RN-…, CP-…) y qué cambia para el usuario. -->

## Cómo se verificó

<!-- Pruebas nuevas, qué se probó en local (dev server, usuarios del seed) y con qué datos. -->

## Autorrevisión (G12 del Plan de Calidad)

Proyecto con un solo desarrollador: esta lista reemplaza la revisión de una segunda persona.
El CI ("Tipos, lint, pruebas y build") ya es obligatorio para hacer merge.

- [ ] Leí el diff completo en GitHub, archivo por archivo (`git diff -w` si hay ruido de saltos de línea).
- [ ] Toda query filtra por `tenantId` de la sesión (regla 1).
- [ ] Toda ruta lee el cuerpo con `readJsonBody` y lo valida con Zod; sin sesión → `unauthorized()`,
      sin permiso → `forbidden()` (reglas 4 y CP-49/CP-50).
- [ ] Si la ruta asigna roles o permisos: pasa por `checkTargetChange` / `ungrantable` (RN-20).
- [ ] Si desactiva un usuario o cambia su clave, usuario o rol: `sessionRevocationData()` (RN-19);
      si cambia una clave: `clearLoginLock()`.
- [ ] Cálculos de pago: `finalPay` sigue saliendo de `netPay`; las propinas no entran al total.
- [ ] Sin `any`, sin secretos ni contraseñas en código, docs o pruebas (regla 7).
- [ ] Hay pruebas que fallarían sin este cambio (o explico por qué no aplica).
- [ ] Si cambia el esquema: script `prisma/turso-migrate-*.mjs` idempotente con rollback, aplicado en
      el demo antes del merge y en cada cliente antes de promover (regla 8).
- [ ] Si cambia la funcionalidad: actualizados la documentación, el manual y sus PDF (`npm run docs:pdf`).
