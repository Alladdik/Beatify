@echo off
title Beatify Desktop
cd /d "%~dp0"

echo [1/2] Building web client + backend (Release)...
call npm run build:web --prefix client
if errorlevel 1 (
  echo Client build failed!
  pause
  exit /b 1
)
dotnet build server -c Release -v q
if errorlevel 1 (
  echo Server build failed!
  pause
  exit /b 1
)

echo [2/2] Launching Beatify...
call npx electron .
