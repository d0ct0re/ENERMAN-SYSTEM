# Projectra (ENERMAN) — instrucciones para Claude

Responder siempre en español. Sistema en producción en https://ampr.site (Hostinger).
Stack: React + TypeScript + Vite + Tailwind (frontend), PHP 8.3 + MySQL (api/).

## Trabajo en dos laptops (Windows y Mac) al mismo tiempo

La memoria de Claude (`~/.claude/`) NO se comparte entre laptops; solo viaja lo que está en git.

1. **Al empezar cada sesión:** `git fetch origin`, `git status`, `git branch -a` y leer
   "Trabajo en curso" (abajo). Si hay cambios sin commit que no son de esta sesión, preguntar
   antes de tocar esos archivos.
2. **Nunca trabajar directo en `main` ni en `dev`.** Una rama por tema, creada desde
   `origin/dev`. Si ya existe una rama del mismo tema (de la otra laptop), seguir en esa en lugar
   de crear otra: dos laptops sobre el mismo tema sin saberlo ya pasó (H1–H8 se hicieron dos veces).
3. **Commits chicos y frecuentes.** Nada sin commit al cerrar la sesión.
4. **Push, merge a `dev`/`main` y deploy los decide el usuario.** Claude prepara todo y pregunta.
5. **Al cerrar la sesión:** actualizar "Trabajo en curso" en este archivo y hacer commit.
6. El repo debe estar fuera de OneDrive/iCloud en cada laptop (ver `docs/SETUP-LAPTOP.md`).

Proceso de deploy completo, verificación y qué hacer si falla: **`docs/DEPLOY.md`**.
Configurar una laptop nueva: **`docs/SETUP-LAPTOP.md`**.

## Reglas del equipo

- **Transparencia:** nunca omitir o suavizar el estado real (tests que fallan, pasos saltados,
  deploys sin verificar). Un deploy solo está hecho cuando `scripts/verify-deploy.mjs` lo confirma.
- **Agrupar cambios** antes de publicar; no un deploy por cada corrección chica.
- **Bug de "no se guarda / se revierte solo":** primero confirmar si la BD ya tiene el dato
  correcto (si sí, el bug es frontend) antes de tocar el backend. Skill: `auditoria-guardado`.
- **Folio visible:** todo lugar que mencione un proyecto o solicitud muestra su `#folio` en color
  accent/dorado.
- **Sin leyendas redundantes:** quitar textos tipo "(obligatorio)" / "(opcional)" cuando ya hay
  indicador rojo/verde, en todos los perfiles.
- **Enfoque:** traducir documentos y procesos directo a código; nada de análisis abstractos.
- `api/config.php` nunca va en git ni se sube; `api/diag.php` no debe existir en el servidor.

## Skills del proyecto (`.claude/skills/`, compartidas por git)

- `deploy-hostinger` — publicar y verificar de verdad.
- `auditoria-guardado` — bugs de datos que no se guardan o se revierten.

## Trabajo en curso

_Actualizar al cerrar cada sesión: qué rama, qué quedó hecho, qué sigue, quién (Windows/Mac)._

### Reparto actual (para no duplicar trabajo) — 2026-10-09
| Tema | Quién | Rama | Estado |
|---|---|---|---|
| H14 CORS: la API acepta cualquier `*.vercel.app` con sesión (**ALTA, abierto en producción**) | Mac | `fix/cors-vercel` (desde `dev`) | En GitHub (`8988870`). Falta merge a `dev` |
| Ajuste de sesión: `session_regenerate_id(false)` | Mac | `fix/cors-vercel` | En GitHub (`8988870`) |
| Deploy a staging por FTPS con TLS 1.2 (`NODE_OPTIONS=--tls-max-v1.2` en la Action, `--tls-max 1.2` en curl) | Mac | `fix/deploy-ftps` | En GitHub (`d09a89c`). **Sin probar en Actions** hasta el primer push a `dev` |
| `deploy.sh` (respaldo manual de deploy para Mac) | Mac | `fix/deploy-ftps` | En GitHub (`d09a89c`). Falta documentarlo en `docs/DEPLOY.md` |
| `deploy.yml` (producción) sigue con `protocol: ftp` sin cifrar (H4) | — | — | Pendiente: aplicar lo mismo que staging cuando staging funcione |
| Carpeta `bitacora/` (notas Obsidian, 231 KB) | Mac | solo local (`mac-autor-reescrito`) | Decidir si va al repo (propuesta: `docs/bitacora/` sin PDF). Menciona `ASBT2026!` en una nota |
| Estructura de equipo, docs, verificación, reporte de auditoría | Windows | `estructura-equipo` | Listo para merge a `dev` |
| Contraseñas de los 22 usuarios (H6) | Usuario + Mac | — | **Hecho 2026-10-09** en phpMyAdmin (22/22 `hash_ok`). Respaldo: tabla `app_users_respaldo_20261009`. Listado solo en la Mac (`~/Documents/Projectra-credenciales/`), nunca en git |
| Quitar `reset_active_passwords` (regresa a todos a `ASBT2026!`) | — | — | Pendiente de decisión del usuario |
| Borrar `api/diag.php` del servidor | Usuario | — | Pendiente (`verify-deploy.mjs prod` lo marca ✗) |

Merge de prueba local (2026-10-09): `estructura-equipo` + `fix/deploy-ftps` + `fix/cors-vercel` sobre
`origin/dev` entran sin conflictos, `npm run build` pasa y el workflow de staging combinado conserva
TLS 1.2 y la validación PHP. Orden sugerido: esas tres a `dev` → verificar staging → `deploy.yml` a
FTPS → `main`.

### Auditoría de cumplimiento (ISO / OWASP)
- Reporte: `docs/auditoria/cumplimiento-projectra.html` y su PDF (regenerar con
  `node docs/auditoria/pdf.cjs`). Versión publicada: https://claude.ai/artifact/2o85F1Rfgm1gRtaJTq6e6m
- **Correcciones H1–H8 + H6 parcial + CSP en modo prueba: ya están en `dev`** (commits de la Mac
  `54a409b` y `79548d5`, 2026-10-09). Sin publicar a producción.
- **Bloqueo actual:** el deploy a staging falla desde que se pasó a FTPS (Hostinger corta TLS 1.3;
  ver reparto). Nota: curl usa `-k` porque el certificado de Hostinger es `*.hstgr.io`; mejor usar
  ese hostname como `FTP_HOST` y quitar `-k`.
- **H14 (CORS vercel.app)** se agregó al reporte el 2026-10-09: lo encontró la Mac; la revisión de
  Windows lo había pasado por alto. A01 pasa a "No cumple".
- Pendientes del usuario: borrar `api/diag.php` del servidor, cambiar `CRON_SECRET` en el
  `config.php` del servidor.
- Pendientes de código: H6 completo (contraseña por defecto en seed/restore), H9 dependencias de
  desarrollo, H10 crecimiento de notificaciones, H11 pruebas automatizadas, H12 respaldos
  externos y completos, H13 aviso de privacidad, CSP en modo real.
- Al corregir un hallazgo: actualizar la tabla "Avance de mejoras" del reporte y regenerar el PDF.

### Estructura de trabajo en equipo — rama `estructura-equipo` (Windows, 2026-10-09)
- CLAUDE.md, docs/DEPLOY.md, docs/SETUP-LAPTOP.md, scripts/verify-deploy.mjs, .gitattributes,
  skills compartidas, re-ejecución manual de workflows, validación PHP en GitHub Actions.
  Lista para merge a `dev`.
- La rama `seguridad-auditoria` (solo local en Windows) quedó obsoleta: su código ya está en `dev`.

### Interfaz de ingeniero (Windows, 2026-10-15)
- Rama compartida: interfaz_ingeniero. Cambios de interfaz, dashboard y modales reutilizables de fases 1 y 2; sin merge a main/dev ni despliegue.
- Build y pruebas locales de pasos, datos y mobile aprobadas. Instrucciones: docs/PRUEBAS-INTERFAZ-INGENIERO.md.
- Demo de grafica solo DEV; retirar TODO: REMOVE_DEMO_CHART_DATA antes de entrega final.

### Actualizacion de interfaz (Windows, 2026-10-16)
- Rama interfaz_ingeniero: Recharts, simplificacion de KPIs y navegacion de fases, transiciones de pasos, modal de altura estable, hover de botones y cierre tras guardar correctamente.
- Se conserva la curva anterior al experimento de redondeado. Datos de grafica memorizados para evitar reinicios por movimiento del cursor.
- Compartir por rama para localhost; sin merge ni deploy. Instalar dependencias con npm ci tras actualizar.
