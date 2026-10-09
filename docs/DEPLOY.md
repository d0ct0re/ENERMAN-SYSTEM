# Proceso de deploy — Projectra (ampr.site)

Un solo proceso, igual en Windows y en Mac. Si algo de este documento no coincide con la
realidad, se corrige aquí primero (en una rama, como cualquier cambio).

## Ambientes

| Rama   | Publica en                         | Workflow                              |
|--------|------------------------------------|---------------------------------------|
| `dev`  | https://ampr.site/staging/ (pruebas) | `.github/workflows/deploy-staging.yml` |
| `main` | https://ampr.site/ (producción)     | `.github/workflows/deploy.yml`        |

Las demás ramas no publican nada. El deploy lo hace GitHub Actions al recibir el push, desde
sus servidores, así que **no importa desde qué laptop se haga el push**.

## Flujo de un cambio

```
rama de tema ──merge──▶ dev ──(Actions)──▶ staging ──probar──▶ merge a main ──(Actions)──▶ producción
```

1. **Rama de tema** desde `dev` actualizado:
   ```bash
   git fetch origin
   git checkout -b <tema> origin/dev
   ```
   Antes de crearla, revisar `git branch -a` para no duplicar una que ya exista en la otra laptop.
2. **Validar localmente** antes de cada commit que toque código:
   ```bash
   npm run build                                   # TypeScript + build
   find api -name "*.php" -exec php -l {} \; | grep -v "No syntax errors"   # si hay PHP; sin salida = OK
   ```
   GitHub Actions repite la validación de PHP antes de publicar y se detiene si hay errores.
3. **Commit y push de la rama** (no publica nada):
   ```bash
   git push -u origin <tema>
   ```
4. **A staging:** merge de la rama a `dev` y push.
   ```bash
   git checkout dev && git pull
   git merge --no-ff <tema>
   git push origin dev
   ```
5. **Verificar staging** cuando termine el workflow (ver "Verificación" abajo) y recorrer en el
   navegador lo que cambió, con el rol que corresponda.
6. **A producción:** solo cuando staging está bien.
   ```bash
   git checkout main && git pull
   git merge --no-ff dev
   git push origin main
   ```
7. **Verificar producción.**

**Push a `dev` y a `main` los decide el dueño del proyecto.** Claude prepara todo hasta el paso 3
y se detiene a preguntar.

**Agrupar cambios:** no publicar a producción después de cada corrección chica; juntar varias en
`dev`, probarlas juntas y publicar de una vez.

## Verificación (obligatoria después de cada deploy)

El log de GitHub puede decir "success" sin que el sitio haya cambiado (Hostinger corta el FTP
de forma intermitente). La única prueba válida es el sitio en vivo:

```bash
# desde el mismo commit que se publicó:
npm run build:staging && node scripts/verify-deploy.mjs staging
npm run build         && node scripts/verify-deploy.mjs prod
```

El script compara el bundle del build local contra el que sirve el sitio y revisa que
`api/diag.php` y `api/config.php` no respondan por HTTP. Si sale con ✗, el deploy no está
completo.

Estado del workflow sin abrir GitHub (no requiere sesión):
```bash
curl -s "https://api.github.com/repos/d0ct0re/ENERMAN-SYSTEM/actions/runs?per_page=3"
```

## Si el deploy falla

1. **Re-ejecutarlo sin commit nuevo:** GitHub → Actions → el workflow → *Run workflow* (o
   `gh workflow run deploy.yml --ref main` / `gh workflow run deploy-staging.yml --ref dev`).
   El workflow ya reintenta y tiene respaldo por FTP directo.
2. **Si falla dos veces igual**, ya no es intermitencia: revisar qué paso falló en
   `.../actions/runs/<id>/jobs` antes de reintentar.
3. **Respaldo manual:** Windows con `.\deploy.ps1` (WinSCP, credenciales en `.env.deploy`;
   excluye `config.php` y `diag.php`). Mac con `deploy.sh` (en preparación en la Mac; usa FTPS
   con TLS 1.2 porque Hostinger corta las subidas con TLS 1.3). Ambos requieren `.env.deploy`.

## Reglas fijas

- `api/config.php` (contraseñas de BD, SMTP, `CRON_SECRET`) **nunca** está en git ni se sube por
  ningún método. Cambios en él se hacen a mano en hPanel → Administrador de archivos.
- `api/diag.php` no debe existir en el servidor. Para comprobar que la base responde, usar
  `scripts/verify-deploy.mjs` o entrar al sistema.
- No se edita nada directo en el servidor salvo `config.php`: todo cambio pasa por git.

## Revertir

```bash
git checkout main && git pull
git revert <commit>      # crea un commit que deshace el cambio, sin borrar historial
git push origin main     # Actions publica la versión revertida
```

## Respaldo de base de datos

- Automático: cron diario del servidor (`action=cron_backup`), 30 días de retención, en el mismo
  servidor (pendiente H12: copia externa).
- Manual: hPanel → Bases de datos → phpMyAdmin → `u412785491_amper` → Exportar → SQL.
  Hacerlo antes de cualquier cambio que toque la estructura de la base.

## Configuración inicial de una laptop nueva

Ver `docs/SETUP-LAPTOP.md`.
