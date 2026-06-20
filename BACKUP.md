# Backups de la base de datos — Nómina Xpress

## Cómo funciona

Un workflow de GitHub Actions (`backup-db.yml`) corre automáticamente cada **domingo a las 03:00 UTC**. El proceso:

1. Descarga el volcado completo de la base Turso con `turso db shell ... .dump`
2. Lo cifra con GPG / AES-256 usando la clave `BACKUP_GPG_PASSPHRASE`
3. Lo sube como artefacto de GitHub Actions con retención de **56 días** (8 semanas)

Al cabo de 8 semanas el artefacto más antiguo se borra automáticamente, por lo que siempre habrá como máximo 8 backups disponibles.

También se puede lanzar manualmente desde **Actions → Weekly DB Backup → Run workflow**.

---

## Secrets requeridos en el repositorio

| Secret | Valor |
|--------|-------|
| `TURSO_DATABASE_URL` | `libsql://nominaxpress-fiori-camilo1408...turso.io` |
| `TURSO_AUTH_TOKEN` | Token de autenticación de Turso |
| `BACKUP_GPG_PASSPHRASE` | Contraseña para cifrar/descifrar el backup |

Configurar en: **GitHub → Settings → Secrets and variables → Actions → New repository secret**

Genera una contraseña segura con:
```bash
openssl rand -base64 32
```
Guárdala en un gestor de contraseñas; sin ella el backup cifrado es irrecuperable.

---

## Restaurar un backup

### 1. Descargar el artefacto

En GitHub: **Actions → Weekly DB Backup → [ejecución deseada] → Artifacts → turso-backup-XXX**

Descarga el archivo `.sql.gpg`.

### 2. Descifrar

```bash
gpg --batch --passphrase "TU_PASSPHRASE" \
    --decrypt backup-YYYY-MM-DD.sql.gpg \
    --output backup-YYYY-MM-DD.sql
```

### 3. Restaurar en Turso

> ⚠️ Esto sobreescribe los datos actuales de producción. Asegúrate de estar restaurando en la base correcta.

```bash
# Instalar Turso CLI si no lo tienes
curl -sSfL https://get.tur.so/install.sh | bash

# Autenticarse
turso auth login

# Restaurar línea a línea (SQLite dump es SQL estándar)
turso db shell "$TURSO_DATABASE_URL" < backup-YYYY-MM-DD.sql
```

Si la base tiene datos existentes y quieres una restauración limpia:
```bash
# 1. Crear una nueva base temporal y restaurar ahí para verificar
turso db create nominaxpress-restore
turso db shell nominaxpress-restore < backup-YYYY-MM-DD.sql

# 2. Verificar que los datos estén correctos en la base temporal
turso db shell nominaxpress-restore "SELECT COUNT(*) FROM User;"

# 3. Si todo está bien, actualizar TURSO_DATABASE_URL en Vercel al nuevo nombre
```

---

## Verificar integridad sin restaurar

Para revisar el contenido sin tocar producción:

```bash
# Descifrar
gpg --batch --passphrase "TU_PASSPHRASE" \
    --decrypt backup-YYYY-MM-DD.sql.gpg \
    --output backup-YYYY-MM-DD.sql

# Abrir en SQLite local
sqlite3 temp-verify.db < backup-YYYY-MM-DD.sql
sqlite3 temp-verify.db "SELECT COUNT(*) FROM User; SELECT COUNT(*) FROM TimeEntry;"

# Limpiar
rm backup-YYYY-MM-DD.sql temp-verify.db
```
