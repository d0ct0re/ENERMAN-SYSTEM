# Configurar una laptop para trabajar en Projectra

Aplica a Mac y Windows. Se hace una vez por máquina.

## 1. El repo va FUERA de OneDrive / iCloud / Dropbox

Si dos laptops abren la misma carpeta sincronizada, el servicio de sincronización copia archivos
a medio editar de una máquina a otra (ya pasó: cambios sin commit de Windows aparecieron en la
Mac) y puede corromper la carpeta `.git`. Cada laptop tiene **su propio clon**, y la única vía de
intercambio es git.

```bash
# Mac (cualquier carpeta que no sincronice iCloud/OneDrive; ej. ~/dev)
mkdir -p ~/dev && cd ~/dev
git clone https://github.com/d0ct0re/ENERMAN-SYSTEM.git
cd ENERMAN-SYSTEM

# Windows (cuando se migre la carpeta actual de OneDrive)
#   git clone https://github.com/d0ct0re/ENERMAN-SYSTEM.git C:\dev\ENERMAN-SYSTEM
```

## 2. Identidad de git (la misma en las dos máquinas)

```bash
git config --global user.name  "d0ct0re"
git config --global user.email "d0ct0renomah@gmail.com"
git config --global pull.rebase false
git config --global init.defaultBranch main
```

En Mac además: `git config --global core.autocrlf input`. En Windows: `core.autocrlf true`.
(El archivo `.gitattributes` del repo fuerza LF de todos modos.)

## 3. Herramientas

| Herramienta | Versión | Mac | Windows |
|---|---|---|---|
| Node.js | 20 o superior (GitHub Actions usa 20; 22 también funciona) | `brew install node` o nvm | instalador de nodejs.org |
| PHP (opcional) | 8.3 — solo para probar la API en local; GitHub Actions ya valida la sintaxis PHP antes de publicar | `brew install php` (requiere Homebrew) | `winget install PHP.PHP.8.3` |
| GitHub CLI (opcional) | — | `brew install gh` | `winget install GitHub.cli` |
| WinSCP (solo respaldo de deploy) | — | no aplica | winscp.net |

Comprobar:
```bash
node -v      # v20 o superior
php -v       # 8.3.x (si se instaló)
```

## 4. Dependencias y build

```bash
npm ci
npm run build
```

## 5. Archivos que NO vienen en git (pedirlos al dueño, nunca por chat ni correo sin cifrar)

| Archivo | Para qué | ¿Hace falta? |
|---|---|---|
| `api/config.php` | Conexión a BD para correr la API en local | Solo si se va a probar PHP en local |
| `.env.deploy` | Credenciales FTP para `deploy.ps1` | Solo en la laptop Windows |

## 6. Comprobación final

```bash
git status                                   # limpio
git branch -a                                # ver ramas de la otra laptop
node scripts/verify-deploy.mjs prod          # después de npm run build sobre main
```

## 7. Claude Code en esta laptop

Claude lee `CLAUDE.md` solo al abrir el proyecto. La memoria de Claude de cada laptop es local y
no se sincroniza: todo lo que la otra máquina deba saber va en `CLAUDE.md` o en `docs/`.

Prompt para configurar Claude la primera vez (pegar tal cual en la sesión nueva):

> Lee CLAUDE.md, docs/DEPLOY.md, docs/SETUP-LAPTOP.md y docs/auditoria/ completos. Luego:
> 1) Revisa que esta laptop cumpla docs/SETUP-LAPTOP.md (repo fuera de carpetas sincronizadas,
> identidad de git, Node 20, PHP 8.3, npm ci, npm run build) y dime qué falta; arregla lo que no
> requiera mi decisión. 2) Guarda en tu memoria las reglas de trabajo de CLAUDE.md (idioma,
> ramas, deploy, reglas del equipo) para seguirlas siempre. 3) Haz git fetch y dime qué ramas
> hay, en cuál estoy y si hay trabajo en curso de la otra laptop según "Trabajo en curso" de
> CLAUDE.md. No hagas push, merge a dev/main ni deploy sin que yo lo pida.
