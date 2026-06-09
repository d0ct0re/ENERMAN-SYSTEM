# deploy.ps1 — Build y deploy a Hostinger via FTP
# Uso: .\deploy.ps1
# Requiere WinSCP instalado o disponible en PATH.
# Descarga WinSCP portable: https://winscp.net/eng/download.php

param(
    [switch]$SkipBuild,
    [switch]$ApiOnly,
    [switch]$FrontendOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Cargar credenciales FTP ─────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot ".env.deploy"
if (-not (Test-Path $envFile)) {
    Write-Error "No existe .env.deploy. Copia .env.deploy.example y llena tus datos FTP."
    exit 1
}
foreach ($line in Get-Content $envFile) {
    if ($line -match "^\s*#" -or $line.Trim() -eq "") { continue }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim())
    }
}

$FTP_HOST   = $env:FTP_HOST
$FTP_USER   = $env:FTP_USER
$FTP_PASS   = $env:FTP_PASS
$REMOTE_DIR = $env:FTP_REMOTE_DIR

# ── Build frontend ───────────────────────────────────────────────────────────
if (-not $SkipBuild -and -not $ApiOnly) {
    Write-Host "`n[1/3] Building frontend..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Build falló"; exit 1 }
    Write-Host "Build OK" -ForegroundColor Green
}

# ── Buscar WinSCP ────────────────────────────────────────────────────────────
$winscp = Get-Command "winscp.com" -ErrorAction SilentlyContinue
if (-not $winscp) {
    $candidates = @(
        "C:\Program Files (x86)\WinSCP\WinSCP.com",
        "C:\Program Files\WinSCP\WinSCP.com",
        (Join-Path $PSScriptRoot "tools\WinSCP.com")
    )
    foreach ($c in $candidates) { if (Test-Path $c) { $winscp = $c; break } }
}
if (-not $winscp) {
    Write-Error @"
WinSCP no encontrado. Opciones:
  A) Instala WinSCP: https://winscp.net/eng/download.php
  B) Descarga el portable y coloca WinSCP.com en: $PSScriptRoot\tools\
"@
    exit 1
}

# ── Función de upload FTP ────────────────────────────────────────────────────
function Invoke-WinSCP {
    param([string]$Script)
    $tmpScript = [System.IO.Path]::GetTempFileName() + ".txt"
    $Script | Set-Content $tmpScript -Encoding UTF8
    & $winscp /ini=nul /script=$tmpScript
    Remove-Item $tmpScript -Force
    if ($LASTEXITCODE -ne 0) { throw "WinSCP terminó con error $LASTEXITCODE" }
}

$ftpUrl = "ftp://${FTP_USER}:${FTP_PASS}@${FTP_HOST}/"

# ── Subir frontend (dist/) ───────────────────────────────────────────────────
if (-not $ApiOnly) {
    Write-Host "`n[2/3] Subiendo frontend (dist → public_html)..." -ForegroundColor Cyan
    $distPath = (Join-Path $PSScriptRoot "dist") -replace "\\", "/"

    Invoke-WinSCP @"
open $ftpUrl
option batch abort
option confirm off
synchronize remote "$distPath/" "$REMOTE_DIR/"
close
exit
"@
    Write-Host "Frontend subido" -ForegroundColor Green
}

# ── Subir API (api/) sin config.php ni diag.php ─────────────────────────────
if (-not $FrontendOnly) {
    Write-Host "`n[3/3] Subiendo API (api/ → public_html/api/)..." -ForegroundColor Cyan
    $apiPath = (Join-Path $PSScriptRoot "api") -replace "\\", "/"

    Invoke-WinSCP @"
open $ftpUrl
option batch abort
option confirm off
synchronize remote "$apiPath/" "$REMOTE_DIR/api/"
close
exit
"@
    Write-Host "API subida" -ForegroundColor Green
}

Write-Host "`nDeploy completado exitosamente." -ForegroundColor Green
Write-Host "Sitio: https://ampr.site" -ForegroundColor Cyan
