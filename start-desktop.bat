@echo off
title Beatify Desktop
cd /d "%~dp0"

echo [1/2] Building client...
call npm run build:client --prefix client
if errorlevel 1 (
  echo Build failed!
  pause
  exit /b 1
)

echo [2/2] Launching Beatify...
electron .
