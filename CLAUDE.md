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

### Auditoría de cumplimiento (ISO / OWASP)
- Reporte: `docs/auditoria/cumplimiento-projectra.html` y su PDF (regenerar con
  `node docs/auditoria/pdf.cjs`). Versión publicada: https://claude.ai/artifact/2o85F1Rfgm1gRtaJTq6e6m
- **Correcciones H1–H8 + H6 parcial + CSP en modo prueba: ya están en `dev`** (commits de la Mac
  `54a409b` y `79548d5`, 2026-10-09). Sin publicar a producción.
- **Bloqueo actual:** el deploy a staging falla en "Verificar que el staging realmente se publico"
  desde que se pasó a FTPS. Investigar antes de llevar a `main`. Nota: curl usa `-k` porque el
  certificado de Hostinger es `*.hstgr.io`; mejor usar ese hostname como `FTP_HOST` y quitar `-k`.
- Pendientes del usuario: borrar `api/diag.php` del servidor, cambiar `CRON_SECRET` en el
  `config.php` del servidor.
- Pendientes de código: H6 completo (contraseña por defecto en seed/restore), H9 dependencias de
  desarrollo, H10 crecimiento de notificaciones, H11 pruebas automatizadas, H12 respaldos
  externos y completos, H13 aviso de privacidad, CSP en modo real.
- Al corregir un hallazgo: actualizar la tabla "Avance de mejoras" del reporte y regenerar el PDF.

### Estructura de trabajo en equipo — rama `estructura-equipo` (Windows, 2026-10-09)
- CLAUDE.md, docs/DEPLOY.md, docs/SETUP-LAPTOP.md, scripts/verify-deploy.mjs, .gitattributes,
  skills compartidas, re-ejecución manual de workflows. Lista para merge a `dev`.
- La rama `seguridad-auditoria` (solo local en Windows) quedó obsoleta: su código ya está en `dev`.
