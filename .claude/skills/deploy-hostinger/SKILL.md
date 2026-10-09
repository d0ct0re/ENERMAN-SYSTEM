---
name: deploy-hostinger
description: "Publica cambios de Projectra (ENERMAN-SYSTEM) en producción (ampr.site, hosteado en Hostinger). Úsala cuando el usuario pida 'subir a producción', 'hacer deploy', 'publicar los cambios', o cuando haya que verificar si algo ya quedó publicado. Cubre las dos vías reales que tiene este proyecto — el deploy automático por git push (GitHub Actions) y el deploy manual con deploy.ps1/WinSCP — cuándo usar cada una, y cómo verificar de verdad (no confiar en que la herramienta diga 'éxito') que el cambio llegó al sitio en vivo."
---

# Deploy a producción — Projectra / ENERMAN-SYSTEM (ampr.site en Hostinger)

> **Proceso oficial: `docs/DEPLOY.md`** (rama de tema → `dev`/staging → `main`/producción, igual
> en Windows y Mac). Esta skill agrega contexto histórico y diagnóstico; si algo choca, manda
> `docs/DEPLOY.md`. Verificación estándar en cualquier laptop:
> `node scripts/verify-deploy.mjs prod|staging` (después de `npm run build` / `npm run build:staging`).

El usuario NO es técnico, el sistema está por lanzarse a usuarios reales, y ya hubo un
incidente real (2026-09-21) donde el deploy automático falló dos veces seguidas reportando
"éxito" en la subida pero sin que el sitio en vivo cambiara. Esta skill existe para no repetir
esa confusión y para que cada deploy se confirme con evidencia real, no con lo que dice la
herramienta.

## Regla de oro: nunca confiar en "success" — verificar contra el sitio en vivo

Después de CUALQUIER intento de deploy (automático o manual), la única prueba válida es
comparar el hash del bundle que referencia el sitio en vivo contra el hash del build local:

```bash
# Sitio en vivo:
curl -s https://ampr.site/ | grep -oE '(src|href)="[^"]*assets/[^"]*"'

# Build local recién hecho (debe coincidir exactamente):
grep -oE '(src|href)="[^"]*assets/[^"]*"' dist/index.html
```

Si los hashes (`index-XXXXXXXX.js` / `.css`) no coinciden, el deploy NO se completó de verdad,
sin importar lo que haya dicho el log del workflow o del script.

## Antes de cualquier deploy: validar localmente

Nunca proponer subir código sin validar primero:

```bash
# PHP (en Mac: brew install php; en Windows: winget install PHP.PHP.8.3):
find api database -name "*.php" -exec php -l {} \; | grep -v "No syntax errors"
# (sin salida = todo limpio)

# TypeScript + build completo (desde la raíz del repo):
npm run build
```

## Vía 1 (oficial, Windows y Mac): deploy automático por git push

Push a `dev` publica en staging; push a `main` publica en producción. Ambos workflows aceptan
re-ejecución manual (`workflow_dispatch`: GitHub → Actions → Run workflow, o
`gh workflow run deploy.yml --ref main`) para reintentar sin commit nuevo.

Cada push a `main` dispara `.github/workflows/deploy.yml` — corre en servidores de GitHub
(no en esta máquina), hace `npm run build`, sube `dist/` y `api/` (excluyendo `config.php`) por
FTP a Hostinger, y tiene su propia verificación interna con reintento y respaldo por FTP directo.

- `git push origin main` ya tiene permiso concedido en `.claude/settings.local.json`
  (`"Bash(git push origin main)"`) — no hace falta pedir permiso de nuevo para el push en sí,
  pero SÍ hay que confirmar con el usuario antes de cada push real (acción visible/productiva,
  no repetir sin más solo porque el permiso exista).
- Verificar el resultado por la API pública de GitHub (no requiere auth para leer runs):
  ```bash
  curl -s "https://api.github.com/repos/d0ct0re/ENERMAN-SYSTEM/actions/runs?per_page=1" | \
    python -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['head_sha'][:8], r['status'], r['conclusion'])"
  ```
  Para esperar sin bloquear con sleeps largos, usar Bash con `run_in_background: true` y un
  `until` loop (nunca encadenar `sleep` fijo — el harness lo bloquea).
- Si falla, ver qué paso exactamente con `.../actions/runs/<id>/jobs` (lista de steps +
  conclusion). Los logs detallados (`/logs`) requieren admin del repo — normalmente dan 403 sin
  ese permiso; no perder tiempo intentándolo, usar el resumen de steps en su lugar.

### Cuándo NO seguir insistiendo con esta vía

Si el mismo paso falla **dos veces seguidas de forma idéntica** (ej. "Subir frontend" en
success pero "Verificar que el frontend realmente se publicó" en failure, y el hash en vivo
sigue sin cambiar), eso ya no es el hipo intermitente de FTP que el propio workflow anticipa —
es un patrón repetible. No reintentar una tercera vez a ciegas: pasar a la Vía 2.

**Actualización 2026-09-22 — ya falló 3/3 veces, patrón confirmado, no solo sospecha:** las
mismas credenciales FTP (`.env.deploy`) SÍ funcionan de forma confiable vía `deploy.ps1`/WinSCP
desde la red del usuario. El deploy automático de GitHub Actions falló 3 de 3 intentos, siempre
en el mismo paso exacto. La explicación más probable: Hostinger bloquea o limita conexiones FTP
desde rangos de IP de centros de datos en la nube (donde corren los runners de GitHub Actions),
algo común como protección anti-abuso en hosting compartido — no es un problema de credenciales
ni del código. **No perder tiempo reintentando la Vía 1 esperando que "esta vez sí" — ir directo
a la Vía 2 (`deploy.ps1`) como camino principal, no como respaldo, mientras esto no cambie.**

**Actualización 2026-10-09 — ya no aplica como regla:** después de esa nota, Actions publicó con
éxito en producción el 23, 25 y 28 de septiembre (intercalado con fallas que el reintento o el
re-run resolvieron). Como la Mac no puede correr `deploy.ps1`, la Vía 1 es la oficial para las dos
laptops; la Vía 2 queda como respaldo solo desde Windows, cuando un re-run también falla.

## Vía 2 (respaldo, SOLO Windows): deploy manual con `deploy.ps1` (WinSCP)

Existe desde antes de este proyecto de Claude Code, en la raíz del repo. Sube `dist/` y `api/`
(sin `config.php`) directo por FTP vía WinSCP, sin pasar por GitHub Actions — útil cuando la
Vía 1 falla de forma repetible.

Requisitos ya confirmados en esta máquina (2026-09-21): WinSCP instalado en
`C:/Program Files (x86)/WinSCP/WinSCP.com`, y `.env.deploy` con credenciales FTP ya presente
en la raíz del repo (gitignored).

```powershell
# Build + deploy completo (frontend + API):
.\deploy.ps1

# Solo frontend (más rápido si solo cambió src/):
.\deploy.ps1 -FrontendOnly

# Solo API (más rápido si solo cambió api/):
.\deploy.ps1 -ApiOnly
```

Igual que con el push: es una acción real sobre producción, confirmar con el usuario antes de
correrla cada vez (no asumir permiso permanente salvo que el usuario lo diga explícitamente,
igual que con `git push`).

Después de correrlo, verificar SIEMPRE con la comparación de hashes de arriba — `deploy.ps1` no
tiene su propia verificación interna como el workflow de GitHub, así que esta skill es la única
red de seguridad.

## `config.php` del servidor: nunca por ninguna de las dos vías

Ambas vías excluyen explícitamente `config.php` (tiene contraseñas reales de BD/SMTP). Cambios
ahí SIEMPRE se piden al usuario por separado: le paso el bloque de código exacto a agregar y él
lo pega en hPanel → Administrador de archivos → `public_html/api/config.php`. Nunca lo edito yo
vía FTP directo sin que el usuario lo pida explícitamente para esa vez.

## Diagnóstico rápido cuando algo no cuadra

- **¿Los archivos realmente llegaron al servidor?** Pedir al usuario la fecha de "Última
  modificación" de `public_html/assets/` en el Administrador de archivos de hPanel. Reciente =
  sí llegó (el problema es de verificación/caché); vieja = no llegó de verdad (problema de
  fondo, no reintentar la misma vía).
- **¿Está corriendo el cron/acción nueva en producción?** Pegar la URL protegida en el
  navegador (ej. `https://ampr.site/api/index.php?action=cron_daily_kpi_email&key=...`) y leer
  la respuesta JSON.
- **¿Cuántas cuentas de correo puede tener el buzón / cuántos destinatarios puede recibir un
  correo?** Esto NO tiene relación con "buzones" del plan de Hostinger — los destinatarios son
  direcciones externas cualesquiera (Gmail, etc.), no cuentas del dominio.
