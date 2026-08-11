# ENERMAN-SYSTEM — Sistema de Gestión de Proyectos

Sistema interno de gestión de proyectos eléctricos. Acceso restringido al equipo ENERMAN.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | PHP 8 (`api/index.php`) |
| Base de datos | MySQL (Hostinger) |
| Deploy | FTP via `deploy.ps1` (WinSCP) |

---

## Cómo levantar el proyecto localmente

### 1. Clonar el repositorio

```bash
git clone https://github.com/d0ct0re/projectra.git
cd enerman-system   # o el nombre de carpeta donde clonaste
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar el API

Copia el archivo de ejemplo y llena tus credenciales de MySQL:

```bash
cp api/config.example.php api/config.php
```

Edita `api/config.php` con los datos de Hostinger que te compartirá el gestor del sistema.

> `api/config.php` está en `.gitignore` — **nunca lo subas al repo**.

### 4. Correr el frontend en desarrollo

```bash
npm run dev
```

El frontend apunta al API de producción (`https://ampr.site/api`) por defecto.
Para apuntar a un API local, edita `src/lib/api.ts` y cambia `API_BASE_URL`.

---

## Deploy a producción

**Automático (el que se usa siempre):** cualquier push a `main` dispara `.github/workflows/deploy.yml` —
build, sube el frontend y el API por FTP a Hostinger, y **verifica** que el sitio en vivo
realmente sirva el build nuevo antes de dar el job por bueno. Si el sitio no cambió, el
check queda en rojo aunque la subida por FTP no haya tirado error.

**Manual (fallback, casi nunca hace falta):**

```bash
# Requiere WinSCP instalado y el archivo .env.deploy configurado
cp .env.deploy.example .env.deploy
# Edita .env.deploy con las credenciales FTP (te las da el gestor)
./deploy.ps1
```

> `.env.deploy` está en `.gitignore` — **nunca lo subas al repo**.

---

## Flujo de trabajo en equipo (staging)

Hay dos ambientes desplegados, con **bases de datos completamente separadas** —
nada de lo que se prueba en staging toca los datos reales de ENERMAN:

| Rama | URL | Base de datos | Se actualiza cuando... |
|---|---|---|---|
| `dev` | https://ampr.site/staging/ | Separada (staging) | alguien hace push a `dev` |
| `main` | https://ampr.site/ | Producción | alguien hace push a `main` |

**Para trabajar en algo nuevo:**

```bash
git checkout dev
git pull origin dev
# ... hacer cambios ...
git add .
git commit -m "feat: lo que sea"
git push origin dev
```

Un par de minutos después, `https://ampr.site/staging/` ya tiene el cambio —
quien quiera probarlo solo abre esa URL, no hace falta pasar archivos ni
compilar nada. Los 21 usuarios semilla existen ahí también, con la misma
contraseña por defecto (`ASBT2026!`).

**Cuando algo ya se probó y está listo para producción:**

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
```

Eso dispara el deploy real a `https://ampr.site/`.

---

## Archivos sensibles — NUNCA commitear

| Archivo | Motivo |
|---|---|
| `api/config.php` | Credenciales de MySQL |
| `.env.deploy` | Credenciales FTP de Hostinger |
| `.env.local` | URL del API para desarrollo local |

Todos están en `.gitignore`. Si accidentalmente los stageas, cancela con `git restore --staged <archivo>`.

---

## Estructura del proyecto

Ordenado como se lee el sistema de abajo hacia arriba: primero dónde vive el dato, después quién lo sirve, después quién lo muestra.

```
database/                — 1. La fuente de verdad
  schema.sql               tablas reales (projects, requests, app_users, notifications...)
  migration_folio_unique.sql  migraciones puntuales, ya aplicadas en producción
  fase2-cleanup.sql        mantenimiento
  update-user-departments.sql
  backup.ps1                respaldo manual vía PowerShell (además del backup desde la app)

api/                     — 2. Backend (PHP, un solo entrypoint)
  index.php                 arma sesión/DB y despacha por ?action=
  core/
    functions.php           helpers compartidos (db(), tableRows, syncRows, locking)
    auth_guards.php          requireAuth / requireAdmin / requireSystemAdmin
  routes/                    un archivo por dominio (projects, requests, users, uploads...)
  config.php                 credenciales reales — SOLO en el servidor, nunca en git
  config.example.php         plantilla para copiar

src/                      — 3. Frontend (React + TS, consume la API)
  App.tsx                    estado global y orquestación de mutaciones
  lib/
    api.ts                   toda llamada HTTP al backend vive acá, nada más
    realtime.ts               short polling cada 4s (sync casi en tiempo real)
  features/                  una vista por rol: admin/, engineer/, supervisor/
  components/                 ui/ (primitivos) → cards/ → dialogs/ → common/
  hooks/, types/, data/        estado derivado, contratos de tipos, semillas

docs/                     — 4. Referencia, no código
  ANALISIS_PROYECTO.md, CAMPOS.md, HOSTINGER_DEPLOY.md, MIGRATION_LOG.md

.github/workflows/
  deploy.yml                 build + FTP a producción en cada push a main
  deploy-staging.yml          igual pero a /staging/ en cada push a dev
  (ambos verifican que el sitio en vivo realmente cambió antes de dar
   el job por bueno — no solo que el FTP no haya tirado error)
```

> **Nota de orden:** `database/` va primero porque el payload JSON en cada tabla *es* el contrato real entre frontend y backend — cambiar un campo ahí impacta a los dos lados. `api/` va segundo porque es la única capa con permiso de tocar la base directamente. `src/` nunca habla con MySQL, solo con `api/` vía `lib/api.ts`.

---

## Roles del sistema

| Rol | Acceso |
|---|---|
| `system-admin` (Gestor) | Control total — usuarios, consecutivos, backup |
| `admin` | Aprobación de solicitudes, gestión de proyectos |
| `supervisor` | Vista de proyectos de su área |
| `engineer` | Crea solicitudes, ve y edita sus proyectos asignados |

---

## Contacto

Acceso y credenciales: contacta al gestor del sistema — ENERMAN SAS DE CV.
