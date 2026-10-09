#!/usr/bin/env bash
# deploy.sh — Build y deploy a Hostinger desde Mac/Linux (equivalente a deploy.ps1 de Windows).
# Uso:
#   ./deploy.sh                  build + frontend + API a producción (ampr.site)
#   ./deploy.sh --staging        lo mismo, pero a ampr.site/staging
#   ./deploy.sh --frontend-only  solo dist/
#   ./deploy.sh --api-only       solo api/ (sin config.php ni diag.php)
#   ./deploy.sh --skip-build     sube el dist/ que ya existe
# Es el respaldo manual: el camino normal es push a dev/main y GitHub Actions (docs/DEPLOY.md).
# Credenciales en .env.deploy (mismo archivo que usa deploy.ps1, nunca se sube al repo).
# Sube por FTPS: Hostinger presenta un certificado *.hstgr.io que no coincide con
# ftp.ampr.site, así que se cifra la conexión sin validar el nombre (-k).

set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"

SKIP_BUILD=0; API_ONLY=0; FRONTEND_ONLY=0; STAGING=0
for arg in "$@"; do
  case "$arg" in
    --skip-build)    SKIP_BUILD=1 ;;
    --api-only)      API_ONLY=1 ;;
    --frontend-only) FRONTEND_ONLY=1 ;;
    --staging)       STAGING=1 ;;
    *) echo "Opción desconocida: $arg"; exit 1 ;;
  esac
done

cyan()  { printf '\n\033[36m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }

# ── Credenciales FTP ─────────────────────────────────────────────────────────
if [ ! -f .env.deploy ]; then
  red "No existe .env.deploy. Copia .env.deploy.example y llena tus datos FTP."
  exit 1
fi
while IFS='=' read -r key value; do
  key="$(echo "$key" | tr -d '[:space:]')"
  [[ -z "$key" || "$key" == \#* ]] && continue
  value="${value%$'\r'}"
  export "$key=$value"
done < .env.deploy

REMOTE_DIR="$FTP_REMOTE_DIR"
SITE="https://ampr.site"
if [ "$STAGING" = 1 ]; then
  REMOTE_DIR="$FTP_REMOTE_DIR/staging"
  SITE="https://ampr.site/staging"
fi

# ── Datos para el registro (bitacora/Deploys) ───────────────────────────────
START_TS="$(date +%s)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
DIRTY="no"
if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  DIRTY="si"
  red "Aviso: hay cambios sin commit. Lo que se publique no corresponde exactamente a $COMMIT (regla #2)."
fi
TARGET="produccion"; [ "$STAGING" = 1 ] && TARGET="staging"
PARTS="frontend+api"; [ "$API_ONLY" = 1 ] && PARTS="api"; [ "$FRONTEND_ONLY" = 1 ] && PARTS="frontend"
UPLOADED=0; FAILED_FILE=""; BUNDLE=""; DIAG="no revisado"

# Agrega el deploy a bitacora/Deploys: JSONL (para el dashboard) y una fila en la nota de Obsidian.
# Solo si esa carpeta existe en esta copia del repo; si no, no registra nada.
log_deploy() {
  local status="$1" result icon secs
  [ -d bitacora/Deploys ] || return 0
  secs=$(( $(date +%s) - START_TS ))
  if [ "$status" = 0 ]; then result="ok"; icon="✅ ok"; else result="fallo"; icon="❌ fallo"; fi
  printf '{"fecha":"%s","destino":"%s","partes":"%s","rama":"%s","commit":"%s","sin_commit":"%s","archivos":%d,"archivo_fallido":"%s","bundle":"%s","diag":"%s","resultado":"%s","segundos":%d,"equipo":"%s"}\n' \
    "$(date '+%Y-%m-%d %H:%M')" "$TARGET" "$PARTS" "$BRANCH" "$COMMIT" "$DIRTY" "$UPLOADED" "$FAILED_FILE" \
    "$BUNDLE" "$DIAG" "$result" "$secs" "$(hostname -s)" >> bitacora/Deploys/deploys.jsonl
  local notes=""
  [ -n "$FAILED_FILE" ] && notes="Falló: $FAILED_FILE"
  [ "$DIRTY" = "si" ] && notes="$notes Cambios sin commit."
  printf '| %s | %s | %s | %s · %s | %d | %s | %s |\n' "$(date '+%Y-%m-%d %H:%M')" "$TARGET" "$PARTS" \
    "$BRANCH" "$COMMIT" "$UPLOADED" "$icon" "$notes" >> "bitacora/Deploys/Registro de deploys.md"
}

# La contraseña va en un netrc temporal para que no aparezca en la lista de procesos.
NETRC="$(mktemp)"
chmod 600 "$NETRC"
trap 'status=$?; rm -f "$NETRC"; log_deploy "$status"' EXIT
printf 'machine %s login %s password %s\n' "$FTP_HOST" "$FTP_USER" "$FTP_PASS" > "$NETRC"

# Sube los archivos dados (rutas relativas a $1) a $2. Una conexión por archivo y
# hasta 3 intentos; si un archivo falla, el deploy se detiene para no dejar el
# servidor a medias (ver bitacora/Parches P-010 y P-011).
upload() {
  local base="$1" dest="$2"; shift 2
  local f code try
  for f in "$@"; do
    for try in 1 2 3; do
      # --tls-max 1.2: con TLS 1.3 el curl de macOS cierra el canal de datos de forma que
      # Hostinger aborta la transferencia ("450 Link to file server lost").
      code="$(curl --ssl-reqd -k --tls-max 1.2 --netrc-file "$NETRC" --ftp-create-dirs -s \
                   -o /dev/null -w '%{response_code}' -T "$base/$f" "ftp://$FTP_HOST$dest/$f" || true)"
      [ "$code" = "226" ] && break
      sleep 2
    done
    if [ "$code" = "226" ]; then
      UPLOADED=$((UPLOADED + 1))
      echo "  $f -> OK"
    else
      FAILED_FILE="$f"
      red "  $f -> FALLÓ (código $code) tras 3 intentos. Deploy detenido."
      exit 1
    fi
  done
}

echo "Destino: $SITE  ($FTP_HOST:$REMOTE_DIR)"

# ── Revisión previa de la API ───────────────────────────────────────────────
# Un PHP con cualquier carácter antes de "<?php" (p. ej. letras tecleadas por accidente)
# imprime ese texto en TODAS las respuestas y rompe la app entera.
if [ "$FRONTEND_ONLY" = 0 ]; then
  bad=0
  while IFS= read -r f; do
    if [ "$(head -c 5 "$f")" != "<?php" ]; then red "  $f no empieza con <?php"; bad=1; fi
  done < <(find api -name '*.php' ! -name config.php ! -name diag.php)
  if [ "$bad" = 1 ]; then red "Deploy cancelado: corrige los archivos de arriba."; FAILED_FILE="revisión previa PHP"; exit 1; fi
fi

# ── Build frontend ───────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = 0 ] && [ "$API_ONLY" = 0 ]; then
  cyan "[1/3] Compilando frontend..."
  if [ "$STAGING" = 1 ]; then
    npm run build:staging
    # Mismo .htaccess que producción, apuntando a la subcarpeta /staging/.
    sed -e 's|RewriteBase /$|RewriteBase /staging/|' \
        -e 's|RewriteRule \. /index\.html|RewriteRule . /staging/index.html|' \
        public/.htaccess > dist/.htaccess
  else
    npm run build
  fi
  green "Build OK"
fi

# ── Subir frontend (dist/) ───────────────────────────────────────────────────
if [ "$API_ONLY" = 0 ]; then
  cyan "[2/3] Subiendo frontend (dist/ → $REMOTE_DIR/)..."
  # index.html al final: así nunca apunta a un bundle que todavía no termina de subir.
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(cd dist && find . -type f ! -name index.html | sed 's|^\./||' | sort)
  upload dist "$REMOTE_DIR" "${files[@]}" index.html
  green "Frontend subido"
fi

# ── Subir API (api/) sin config.php ni diag.php ─────────────────────────────
if [ "$FRONTEND_ONLY" = 0 ]; then
  cyan "[3/3] Subiendo API (api/ → $REMOTE_DIR/api/)..."
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(cd api && find . -type f ! -name config.php ! -name diag.php | sed 's|^\./||' | sort)
  upload api "$REMOTE_DIR/api" "${files[@]}"
  green "API subida"
fi

# ── Verificación contra el sitio en vivo ────────────────────────────────────
cyan "Verificando el sitio en vivo..."
if [ "$API_ONLY" = 0 ]; then
  expected="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)"
  live="$(curl -s "$SITE/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)"
  BUNDLE="$live"
  echo "  bundle esperado: $expected"
  echo "  bundle en vivo:  $live"
  if [ "$expected" != "$live" ]; then red "  El sitio todavía no sirve el build nuevo"; exit 1; fi
  css="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.css' dist/index.html | head -1)"
  css_type="$(curl -s -o /dev/null -w '%{content_type}' "$SITE/$css")"
  echo "  estilos $css -> $css_type"
  if [[ "$css_type" != text/css* ]]; then red "  El CSS no está en el servidor (la página se vería sin diseño)"; exit 1; fi
  green "  Frontend publicado correctamente"
fi
if [ "$FRONTEND_ONLY" = 0 ]; then
  # Sin el archivo, Hostinger responde 200 con la página de la app; solo es problema si devuelve datos de la BD.
  if curl -s "$SITE/api/diag.php" | grep -q '"tables"'; then
    DIAG="expuesto"
    red "  api/diag.php está PÚBLICO: bórralo del servidor"
  else
    DIAG="ok"
    green "  api/diag.php no expuesto"
  fi
fi

green "Deploy completado. Sitio: $SITE"
