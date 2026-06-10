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

```bash
# Requiere WinSCP instalado y el archivo .env.deploy configurado
cp .env.deploy.example .env.deploy
# Edita .env.deploy con las credenciales FTP (te las da el gestor)
./deploy.ps1
```

> `.env.deploy` está en `.gitignore` — **nunca lo subas al repo**.

---

## Archivos sensibles — NUNCA commitear

| Archivo | Motivo |
|---|---|
| `api/config.php` | Credenciales de MySQL |
| `.env.deploy` | Credenciales FTP de Hostinger |
| `database/fase1-usuarios.sql` | Contiene contraseñas de usuarios |
| `database/insert-users*.sql` | Ídem |
| `database/reset-active-user-passwords.sql` | Ídem |

Todos están en `.gitignore`. Si accidentalmente los stageas, cancela con `git restore --staged <archivo>`.

---

## Estructura del proyecto

```
api/
  index.php          — Único endpoint PHP (action=?)
  config.php         — Credenciales MySQL (ignorado por git)
  config.example.php — Plantilla de configuración

src/
  App.tsx            — Estado global y lógica central
  lib/
    api.ts           — Todas las llamadas HTTP al backend
    realtime.ts      — Short polling cada 4s
    engineer-groups.ts — Grupos y colores por área
  features/
    admin/           — Vista del administrador
    engineer/        — Vista del ingeniero
    supervisor/      — Vista del supervisor
  components/
    common/          — Componentes compartidos (calendario, etc.)
    dialogs/         — Modales
    cards/           — Tarjetas de proyecto/solicitud
    ui/              — Componentes base

database/
  schema.sql         — Estructura de tablas MySQL
  fase2-cleanup.sql  — Scripts de mantenimiento
```

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
