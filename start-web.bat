@echo off
title Beatify — Web / Phone Access
cd /d "%~dp0"

echo.
echo  ========================================
echo    BEATIFY — Phone / Web Mode
echo  ========================================
echo.

echo  [1/2] Building React for web...
call npm run build:web --prefix client
if errorlevel 1 (
  echo  Build failed! Check errors above.
  pause
  exit /b 1
)

echo.
echo  [2/2] Starting server...
echo  The server will print your LAN IP — use that URL on your phone.
echo.
cd server
dotnet run
