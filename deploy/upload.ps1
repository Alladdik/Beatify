# ── Beatify: завантаження коду з Windows на VPS + автооновлення ──────────────
# Використання (з кореня проєкту):
#   .\deploy\upload.ps1 -Server root@1.2.3.4
#   .\deploy\upload.ps1 -Server root@1.2.3.4 -RemoteDir /opt/beatify -SkipUpdate
# Потрібен ssh/scp (є в Windows 10/11 з коробки). Перший раз на VPS після
# завантаження виконай:  ssh root@1.2.3.4 "cd /opt/beatify && bash deploy/deploy.sh"

param(
    [Parameter(Mandatory = $true)][string]$Server,
    [string]$RemoteDir = "/opt/beatify",
    [switch]$SkipUpdate
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$archive = Join-Path $env:TEMP "beatify-src.tar.gz"
Write-Host "[*] Пакую проект -> $archive" -ForegroundColor Cyan

# Пакуємо тільки те, що потрібно для збірки на сервері
tar -czf $archive `
    --exclude=node_modules `
    --exclude=bin `
    --exclude=obj `
    --exclude=dist `
    --exclude=dist-web `
    --exclude=dist-electron `
    --exclude=uploads `
    --exclude=wwwroot/uploads `
    --exclude=*.db `
    client server deploy package.json

if ($LASTEXITCODE -ne 0) { throw "tar помилка" }
$sizeMb = [math]::Round((Get-Item $archive).Length / 1MB, 1)
Write-Host "[*] Архів: $sizeMb MB. Завантажую на $Server..." -ForegroundColor Cyan

ssh $Server "mkdir -p $RemoteDir"
scp $archive "${Server}:$RemoteDir/beatify-src.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp помилка" }

Write-Host "[*] Розпаковую на сервері..." -ForegroundColor Cyan
ssh $Server "cd $RemoteDir && tar -xzf beatify-src.tar.gz && rm beatify-src.tar.gz"

if (-not $SkipUpdate) {
    Write-Host "[*] Запускаю оновлення (docker build + restart)..." -ForegroundColor Cyan
    ssh $Server "cd $RemoteDir && bash deploy/update.sh"
}

Remove-Item $archive -Force
Write-Host "`n✅ Готово!" -ForegroundColor Green
