# Release — Horarios: usabilidad

Checklist de despliegue para la rama `feat/horarios-usabilidad`.
Reglas generales en [DESPLIEGUES.md](../DESPLIEGUES.md).

## Qué entra

| Cambio | Efecto visible |
|---|---|
| Formato de 12 horas | Admin escribe la hora en 12 h; empleado la lee en 12 h |
| Día de descanso | Celda "Descansa" que el empleado ve, distinta de una celda vacía |
| Fecha de inicio elegible | El admin elige el día de inicio; se sugiere el día siguiente al último ya cubierto |
| Responsive | Columna de personal fija y pista "Desliza para ver los demás días" en móvil |
| Un solo horario publicado | Publicar uno despublica automáticamente los demás |

## Cambio de base de datos

Una sola columna, **aditiva**:

```sql
ALTER TABLE "ScheduleShift" ADD COLUMN "restDay" BOOLEAN NOT NULL DEFAULT false;
```

Los turnos existentes quedan con `restDay = false` y sus horas intactas.
No hay `TimeEntry`, nómina, propinas ni reportes afectados.

### Cómo se aplica

**No se usa `migrate-db.yml` ni `prisma/run-migrations.mjs`.** Ese runner lee de
`prisma/migrations/`, cuyo historial está desincronizado desde junio de 2026
(ver `CLAUDE.md`). Como el resto de cambios de esquema recientes, este va con su
script idempotente propio:

```bash
node prisma/turso-migrate-schedule-restday.mjs
```

Con `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` de la base destino en el entorno.
El script funciona igual contra `file:./dev.db` y contra `libsql://…`, es seguro
de ejecutar varias veces (la segunda avisa "ya existe, omitiendo") y verifica al
terminar que la columna quedó y cuántos turnos hay.

### Env vars y feature flags

Ninguno nuevo. Nada que tocar en Vercel.

## Orden de release

La columna tiene que existir **antes** de que corra el código nuevo.

1. **Migrar la BD del demo** (`nomina-xpress`):

   ```bash
   TURSO_DATABASE_URL="libsql://<demo>.turso.io" TURSO_AUTH_TOKEN="<token>" node prisma/turso-migrate-schedule-restday.mjs
   ```

2. **Mergear a `main`.** Vercel despliega el demo solo.

   ```bash
   git checkout main && git merge feat/horarios-usabilidad && git push
   ```

3. **Verificar y aprobar el demo a mano** (lista de abajo).

4. **Migrar la BD de cada cliente** que se vaya a promover:

   ```bash
   TURSO_DATABASE_URL="libsql://<cliente>.turso.io" TURSO_AUTH_TOKEN="<token>" node prisma/turso-migrate-schedule-restday.mjs
   ```

5. **Promover el cliente:**

   ```bash
   git checkout client/cucina-fiori && git merge --ff-only main && git push && git checkout main
   ```

6. **Verificar la URL de producción del cliente.**

## Verificación en el demo antes de promover

- [ ] Crear un horario: la fecha sugerida es la correcta y se puede cambiar.
- [ ] Escribir horas en el campo (`3pm`, `1530`, `8:30`) y ver que se guardan bien.
- [ ] Marcar un día "Descansa" y dejar otro vacío. Guardar.
- [ ] En el detalle: horas en 12 h, "Descansa" visible, vacío como `—`.
- [ ] Publicar: el horario anterior queda en "Borrador" y el aviso lo dice.
- [ ] Entrar como empleado: 12 h, "Descansa" donde toca, y llega la notificación.
- [ ] En móvil (375 px): aparece la pista de scroll y se llega hasta el último día.
- [ ] Abrir un horario **creado antes** de este cambio y ver que sigue bien.

## Rollback

**Instant Rollback** en Vercel al deployment anterior.

No hace falta revertir el esquema: con `restDay` presente y todas las filas en
`false`, la versión anterior del código funciona igual. Si aun así se quiere
quitar la columna, el rollback está documentado en la cabecera del script:

```sql
ALTER TABLE "ScheduleShift" DROP COLUMN "restDay";
```

Ojo: eso borraría los días de descanso ya marcados, que pasarían a ser celdas
vacías.

## Limpieza de datos de prueba

Si se sembraron horarios de prueba en local:

```bash
node scripts/seed-horarios-demo.mjs --limpiar
```

Ese script es solo para la base local; nunca se ejecuta contra producción.
