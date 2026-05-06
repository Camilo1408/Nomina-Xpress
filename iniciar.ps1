# ==============================================
# Script de inicio — Nomina Xpress
# Uso: Doble clic o ejecutar en PowerShell
# ==============================================

$ProjectDir = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   NOMINA XPRESS — Servidor de Desarrollo" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Matar cualquier proceso node existente en puerto 3000
Write-Host "[1/3] Limpiando procesos anteriores..." -ForegroundColor Yellow
$port3000 = netstat -ano 2>$null | Select-String ":3000 " | ForEach-Object {
    ($_ -split '\s+')[-1]
} | Select-Object -Unique
foreach ($pid in $port3000) {
    if ($pid -match '^\d+$' -and $pid -ne '0') {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "   Proceso $pid terminado" -ForegroundColor Gray
    }
}

# 2. Limpiar procesos node huerfanos (max 30 seg de vida sin actividad)
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.CPU -lt 1 -and $_.WorkingSet -lt 5MB) {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "   Listo" -ForegroundColor Green

# 3. Ir al directorio del proyecto
Write-Host "[2/3] Preparando entorno en:" -ForegroundColor Yellow
Write-Host "   $ProjectDir" -ForegroundColor Gray
Set-Location $ProjectDir

# 4. Iniciar servidor
Write-Host "[3/3] Iniciando servidor Next.js..." -ForegroundColor Yellow
Write-Host ""
Write-Host "   URL: http://localhost:3000" -ForegroundColor Green
Write-Host "   Credenciales admin: admin@demo.com / admin123" -ForegroundColor Gray
Write-Host "   Presiona Ctrl+C para detener" -ForegroundColor Gray
Write-Host ""

# Registrar handler para Ctrl+C — matar procesos al salir
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Write-Host "`nDeteniendo servidor..." -ForegroundColor Yellow
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Servidor detenido correctamente." -ForegroundColor Green
}

npm run dev
