# ── Beatify: перенести свою музику з ПК на VPS ───────────────────────────────
# Запускається на Windows з кореня проєкту ПІСЛЯ того, як на сервері виконано install.sh:
#   .\vps-deploy\upload-media.ps1 -Server root@1.2.3.4
#   .\vps-deploy\upload-media.ps1 -Server root@1.2.3.4 -SkipDb      # лише файли (mp3, обкладинки)
#   .\vps-deploy\upload-media.ps1 -Server root@1.2.3.4 -SkipFiles   # лише база (треки, плейлисти, акаунти)
#
# Локальні файли тільки ЧИТАЮТЬСЯ — нічого не видаляється й не змінюється на вашому диску.
# Файли на сервері додаються до існуючих. Базу сервера -Db ЗАМІНЮЄ дампом вашої локальної
# (тому робіть це один раз після встановлення, до того як хтось зареєструвався на сервері).

param(
    [Parameter(Mandatory = $true)][string]$Server,
    [string]$RemoteDir = "/opt/beatify",
    [string]$UploadsDir,
    [switch]$SkipDb,
    [switch]$SkipFiles
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $UploadsDir) { $UploadsDir = Join-Path $root "server\wwwroot\uploads" }

# ── 1. База: pg_dump локальної PostgreSQL → scp → restore-db.sh ───────────────
if (-not $SkipDb) {
    $settings = Get-Content (Join-Path $root "server\appsettings.json") -Raw | ConvertFrom-Json
    $cs = @{}
    foreach ($part in $settings.ConnectionStrings.DefaultConnection.Split(";")) {
        $kv = $part.Split("=", 2)
        if ($kv.Count -eq 2) { $cs[$kv[0].Trim()] = $kv[1].Trim() }
    }

    $pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
    if (-not $pgDump) {
        $pgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $pgDump) { throw "pg_dump не знайдено. Встановіть PostgreSQL client tools або запустіть із -SkipDb" }

    $dump = Join-Path $env:TEMP "beatify.sql"
    Write-Host "[*] Дампую локальну базу '$($cs['Database'])'..." -ForegroundColor Cyan
    $env:PGPASSWORD = $cs["Password"]
    try {
        & $pgDump -h $cs["Host"] -U $cs["Username"] -d $cs["Database"] --clean --if-exists --no-owner --no-privileges -f $dump
        if ($LASTEXITCODE -ne 0) { throw "pg_dump завершився з помилкою" }
    } finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }

    Write-Host "[*] Завантажую дамп ($([math]::Round((Get-Item $dump).Length / 1MB, 1)) MB) і відновлюю на сервері..." -ForegroundColor Cyan
    scp $dump "${Server}:/tmp/beatify.sql"
    if ($LASTEXITCODE -ne 0) { throw "scp помилка" }
    ssh $Server "bash $RemoteDir/vps-deploy/restore-db.sh /tmp/beatify.sql && rm -f /tmp/beatify.sql"
    if ($LASTEXITCODE -ne 0) { throw "відновлення бази не вдалось" }
    Remove-Item $dump -Force
}

# ── 2. Файли: tar-потік напряму в том на сервері (без тимчасових архівів) ──────
if (-not $SkipFiles) {
    if (-not (Test-Path $UploadsDir)) { throw "Не знайдено $UploadsDir" }
    $sizeMb = [math]::Round(((Get-ChildItem $UploadsDir -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB)
    Write-Host "[*] Передаю файли з $UploadsDir (~$sizeMb MB) — це може тривати кілька хвилин..." -ForegroundColor Cyan
    # cmd, а не PowerShell-конвеєр: PowerShell псує бінарний потік
    cmd /c "tar -cf - -C `"$UploadsDir`" . | ssh $Server bash $RemoteDir/vps-deploy/receive-media.sh"
    if ($LASTEXITCODE -ne 0) { throw "передача файлів не вдалась" }
}

Write-Host "`n✅ Готово! Оновіть сторінку сайту — музика на місці." -ForegroundColor Green
