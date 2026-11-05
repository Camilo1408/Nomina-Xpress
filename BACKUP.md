# Backups de base de datos — Nómina Xpress (per-cliente)

Todos los despliegues salen de un solo código base (`main`); cada cliente tiene
su **propia base Turso**. Los backups son **por cliente**: un workflow de GitHub
Actions vuelca, cifra y archiva cada base de la lista `DB_TARGETS`.

## Cómo funciona

El workflow [`backup-db.yml`](.github/workflows/backup-db.yml) corre cada
**domingo a las 03:00 UTC** (o manualmente desde **Actions → Weekly DB Backup →
Run workflow**). Por cada cliente en `DB_TARGETS`:

1. Vuelca la base con [`scripts/db-dump.mjs`](scripts/db-dump.mjs) (solo lectura,
   vía `@libsql/client`) a `backup-<cliente>-<fecha>.sql`.
2. Lo cifra con GPG / AES-256 usando `BACKUP_GPG_PASSPHRASE`.
3. Sube todos los `.gpg` como un artefacto con retención de **180 días (~6 meses)**.

## Secrets requeridos (GitHub → Settings → Secrets and variables → Actions)

| Secret | Valor |
|--------|-------|
| `DB_TARGETS` | **JSON array** con una entrada por cliente: `[{ "name": "...", "url": "libsql://...", "token": "..." }]` |
| `BACKUP_GPG_PASSPHRASE` | Passphrase para cifrar/descifrar los backups |

Ejemplo de `DB_TARGETS` (una línea; incluye demo y cada cliente):

```json
[
  { "name": "demo",         "url": "libsql://nomina-xpress-db-camilo1408...turso.io",   "token": "eyJ..." },
  { "name": "cucina-fiori", "url": "libsql://nominaxpress-fiori-camilo1408...turso.io", "token": "eyJ..." }
]
```

> Los tokens quedan enmascarados en los logs (`::add-mask::`). `DB_TARGETS` es
> también la fuente de verdad de [`migrate-db.yml`](.github/workflows/migrate-db.yml).

## ⚠️ Requisito para que la retención llegue a 180 días

GitHub **limita** la retención de artefactos al máximo del repositorio (por
defecto **90 días**). Como el repo es **privado**, se puede subir hasta 400 días.
Para obtener los 180:

**GitHub → Settings → Actions → General → Artifact and log retention** → subir a
**≥ 180 días** y guardar. Sin esto, `retention-days: 180` se recorta al máximo del
repo (el workflow no falla, pero solo retiene lo que el repo permita).

## Genera la passphrase GPG

```bash
openssl rand -base64 32
```

Guárdala en un gestor de contraseñas; sin ella el backup cifrado es irrecuperable.

> **Incidente 2026-11-05:** la passphrase original se perdió (GitHub no permite leer
> un secret después de guardarlo) y se generó una nueva. Los artefactos anteriores a la
> ejecución `42074043553` (2026-11-05 17:24 UTC) **no se pueden descifrar** y expiran
> solos a los 180 días. Ese es el primer backup restaurable con la frase nueva.

### Rotar la passphrase

En PowerShell: genera 256 bits aleatorios, los guarda como secret y los copia al
portapapeles sin mostrarlos. Pégala de inmediato en el gestor de contraseñas y luego
vacía el portapapeles (`Set-Clipboard -Value $null`).

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $p = [Convert]::ToBase64String($b); gh secret set BACKUP_GPG_PASSPHRASE --repo Camilo1408/Nomina-Xpress --body $p; Set-Clipboard $p; Remove-Variable p, b
```

Después de rotarla, lanza el workflow a mano (**Actions → Weekly DB Backup → Run
workflow**) y comprueba que el artefacto nuevo se descifra: los anteriores siguen
cifrados con la frase vieja.

## Agregar un cliente nuevo al backup

Edita el secret `DB_TARGETS` y añade una entrada `{ "name", "url", "token" }`. Nada
más — el próximo run lo respalda automáticamente.

---

## Restaurar un backup

### 1. Descargar el artefacto

GitHub: **Actions → Weekly DB Backup → [ejecución] → Artifacts → turso-backups-XXX**.
Descarga y elige el archivo del cliente: `backup-<cliente>-YYYY-MM-DD.sql.gpg`.

### 2. Descifrar

GPG pide la passphrase en la terminal, así no queda en el historial de comandos:

```bash
gpg --pinentry-mode loopback \
    --output backup-cucina-fiori-YYYY-MM-DD.sql \
    --decrypt backup-cucina-fiori-YYYY-MM-DD.sql.gpg
```

En Windows, el `gpg` de Git está en `C:\Program Files\Git\usr\bin\gpg.exe`.
Borra el `.sql` descifrado al terminar: contiene datos personales y hashes.

### 3. Restaurar

> ⚠️ El dump ejecuta `DROP TABLE IF EXISTS` + `CREATE`: **sobrescribe** la base
> destino. Restaura primero en una base **nueva/temporal**, verifica, y solo
> entonces apunta el cliente a ella (cambiando su `TURSO_*` en Vercel).

Con el script incluido (no requiere Turso CLI):

```bash
RESTORE_URL="libsql://<base-destino>...turso.io" \
RESTORE_TOKEN="<token-destino>" \
RESTORE_CONFIRM=si \
  node scripts/db-restore.mjs backup-cucina-fiori-YYYY-MM-DD.sql
```

Alternativa con Turso CLI: `turso db shell "<url-destino>" < backup-....sql`.

### 4. Verificar sin tocar producción

Restaura en una base **local** para inspeccionar sin riesgo:

```bash
RESTORE_URL="file:./verify.db" RESTORE_CONFIRM=si \
  node scripts/db-restore.mjs backup-cucina-fiori-YYYY-MM-DD.sql
```

El header del dump (`-- Tabla: X (N filas)`) indica los conteos esperados por tabla.

---

## Prueba de integridad (round-trip)

Verificado 2026-07-08: dump de cucina-fiori (solo lectura) → restauración en base
local → **19 tablas, 1383 filas, conteos idénticos**. El par
[`db-dump.mjs`](scripts/db-dump.mjs) / [`db-restore.mjs`](scripts/db-restore.mjs)
produce SQL estándar restaurable.

Verificado 2026-11-05: el backup **cifrado** de cucina-fiori (ejecución `42074043553`)
se descifró con la passphrase nueva y se restauró en una base SQLite temporal: 26 tablas,
`PRAGMA integrity_check` = `ok` y 0 violaciones de llave foránea.

> **Simulacro trimestral (compuerta G15 del Plan de Calidad):** cada 90 días, descargar
> el último artefacto, descifrarlo, restaurarlo en una base local y anotar aquí la fecha
> y el resultado. Un backup que nunca se restauró no está verificado.
