# AMPR — Guía de Deploy en Hostinger

## Estructura de archivos en el servidor

```
public_html/
├── index.html          ← generado por npm run build
├── assets/             ← generado por npm run build
├── .htaccess           ← generado por npm run build
└── api/
    ├── index.php       ← backend PHP (del repo)
    ├── config.php      ← NUNCA en el repo, solo en el servidor
    └── config.example.php
```

---

## Setup inicial (solo una vez)

### 1. Base de datos en Hostinger
1. hPanel → **Bases de datos MySQL** → Crear base y usuario
2. phpMyAdmin → Selecciona la BD → **Importar** → `database/schema.sql`

### 2. config.php en el servidor
En `/public_html/api/config.php`:
```php
<?php
const DB_HOST    = 'localhost';
const DB_NAME    = 'u412785491_projectra';
const DB_USER    = 'u412785491_projectra';
const DB_PASS    = 'TU_CONTRASENA';
const DB_CHARSET = 'utf8mb4';
```
> ⚠️ Este archivo NUNCA se sube al repo. Solo vive en el servidor.

### 3. Credenciales FTP locales
```bash
cp .env.deploy.example .env.deploy
# Edita .env.deploy con tu usuario y contraseña FTP de Hostinger
```

---

## Flujo de trabajo diario

### Rama `main` = producción
### Rama `dev` = desarrollo

```bash
# Crear rama dev (solo la primera vez)
git checkout -b dev

# Trabajar en dev
git add .
git commit -m "feat: nueva funcionalidad"
git push origin dev

# Cuando está listo para producción
git checkout main
git merge dev
git push origin main
```

---

## Deploy a producción

```powershell
# 1. Asegurarte de estar en main
git checkout main

# 2. Build + deploy completo (frontend + API)
.\deploy.ps1

# Solo frontend
.\deploy.ps1 -FrontendOnly

# Solo API (cambios en PHP)
.\deploy.ps1 -ApiOnly

# Deploy sin rebuild (si ya hiciste build antes)
.\deploy.ps1 -SkipBuild
```

> Requiere WinSCP instalado. Descarga: https://winscp.net/eng/download.php

---

## Revertir a una versión anterior

```bash
# Ver historial de commits
git log --oneline

# Revertir a un commit específico (sin borrar historial)
git revert abc1234

# Ver diferencias entre versiones
git diff abc1234 HEAD -- src/App.tsx
```

Para revertir en el servidor:
```bash
git checkout abc1234        # ve a esa versión
npm run build               # rebuild
.\deploy.ps1 -FrontendOnly  # sube solo el frontend
git checkout main           # vuelve a main
```

---

## Backup de base de datos

```powershell
.\database\backup.ps1
```

O manualmente en Hostinger:
1. hPanel → Bases de datos MySQL → phpMyAdmin
2. Selecciona `u412785491_projectra`
3. Exportar → SQL → Ejecutar

**Frecuencia recomendada:** una vez por semana, o antes de cualquier deploy importante.

---

## Verificar que todo funciona

Después de cada deploy abre en el navegador:
```
https://ampr.site/api/diag.php
```
Debe mostrar: `{"ok":true,"db":"u412785491_projectra","tables":{...}}`

> Elimina `diag.php` del servidor cuando no lo necesites.

---

## Variables de entorno

| Archivo | Propósito | En repo |
|---------|-----------|---------|
| `.env.deploy` | FTP credentials | NO |
| `api/config.php` | DB credentials | NO |
| `.env.deploy.example` | Plantilla FTP | Sí |
| `api/config.example.php` | Plantilla DB | Sí |
