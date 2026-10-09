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
| H14 CORS: la API acepta cualquier `*.vercel.app` con sesión (**ALTA, abierto en producción**) | Mac | `fix/cors-vercel` (desde `dev`) | Corregido en commit local `f8c9fff`, falta subir |
| Ajuste de sesión (del mismo commit `f8c9fff`) | Mac | `fix/cors-vercel` | Falta subir |
| Deploy a staging por FTPS: Hostinger corta TLS 1.3 (error 450), usar TLS 1.2 en el workflow | Mac | `fix/deploy-ftps` | Diagnosticado; `deploy.sh` ya lo resuelve |
| `deploy.sh` (respaldo manual de deploy para Mac) | Mac | `fix/deploy-ftps` | Hecho en `f8c9fff`, falta subir y documentar en `docs/DEPLOY.md` |
| Carpeta `bitacora/` (notas, commit `e22a402`) | Mac | — | Decidir si va en este repo; nunca debe llevar contraseñas |
| Estructura de equipo, docs, verificación, reporte de auditoría | Windows | `estructura-equipo` | Listo para merge a `dev` |
| SQL de contraseñas en texto plano (H6) en phpMyAdmin | Usuario | — | Pendiente de correr y mandar captura a la Mac |
| Borrar `api/diag.php` del servidor | Usuario | — | Pendiente |

Los commits locales de la Mac salieron con autor "mac": reescribir el autor a `d0ct0re` antes de
subirlos (todavía no están en GitHub, así que es seguro).

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
