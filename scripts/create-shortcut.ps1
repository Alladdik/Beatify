# Creates a Desktop shortcut that launches the whole Beatify stack.
# Clicking it starts Electron, which in turn spawns the .NET backend (:5000)
# and loads the UI from it. No console window, nothing to start by hand.
#
# Run once:  powershell -ExecutionPolicy Bypass -File scripts\create-shortcut.ps1

$ErrorActionPreference = 'Stop'

$repo     = Split-Path -Parent $PSScriptRoot          # repo root (spotify clone)
$electron = Join-Path $repo 'node_modules\electron\dist\electron.exe'
$icoAsset = Join-Path $repo 'electron\assets\icon.ico'

if (-not (Test-Path $electron)) {
    throw "electron.exe not found at $electron - run 'npm install' in the repo root first."
}

# Prefer a branded icon if one has been added, otherwise use electron.exe's own icon.
$icon = if (Test-Path $icoAsset) { $icoAsset } else { $electron }

$desktop  = [Environment]::GetFolderPath('Desktop')
$lnkPath  = Join-Path $desktop 'Beatify.lnk'

$shell    = New-Object -ComObject WScript.Shell
$sc       = $shell.CreateShortcut($lnkPath)
$sc.TargetPath       = $electron
$sc.Arguments        = '.'
$sc.WorkingDirectory = $repo
$sc.IconLocation     = $icon
$sc.Description       = 'Beatify - music player (backend + frontend)'
$sc.WindowStyle      = 1
$sc.Save()

Write-Host "Shortcut created: $lnkPath"
Write-Host "  target: $electron . (cwd: $repo)"
