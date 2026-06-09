# database/backup.ps1 — Backup de MySQL via phpMyAdmin export URL o mysqldump
# Uso: .\database\backup.ps1

$DB_HOST = "localhost"
$DB_NAME = "u412785491_projectra"
$DB_USER = "u412785491_projectra"
# Pon tu contraseña aquí o carga desde .env.deploy
$DB_PASS = Read-Host "Contraseña MySQL"

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$outFile   = Join-Path $PSScriptRoot "backup_${timestamp}.sql"

# Intentar mysqldump si está disponible
$mysqldump = Get-Command "mysqldump" -ErrorAction SilentlyContinue
if ($mysqldump) {
    Write-Host "Generando backup con mysqldump..." -ForegroundColor Cyan
    & mysqldump --host=$DB_HOST --user=$DB_USER --password=$DB_PASS $DB_NAME | Out-File $outFile -Encoding UTF8
    Write-Host "Backup guardado en: $outFile" -ForegroundColor Green
} else {
    Write-Host @"
mysqldump no está en PATH.
Alternativa manual:
  1. Ve a Hostinger → Bases de datos → phpMyAdmin
  2. Selecciona '$DB_NAME'
  3. Pestaña Exportar → Formato SQL → Ejecutar
  4. Guarda el .sql aquí como: $outFile
"@ -ForegroundColor Yellow
}
