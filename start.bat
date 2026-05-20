@echo off
title Beatify - Starting...
echo.
echo  ========================================
echo    BEATIFY - Music Streaming Platform
echo  ========================================
echo.
echo  [1/2] Starting ASP.NET Backend...
start /B cmd /c "cd /d "%~dp0server" && dotnet run 2>&1 > "%~dp0server.log""

echo  [2/2] Starting React Frontend...
start /B cmd /c "cd /d "%~dp0client" && npm run dev 2>&1 > "%~dp0client.log""

echo.
echo  Waiting for servers to start...
timeout /t 5 /nobreak >nul

echo  Opening browser...
start http://localhost:5173

echo.
echo  Beatify is running!
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:5000
echo.
echo  Press any key to stop all servers...
pause >nul

echo Stopping servers...
taskkill /f /im dotnet.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
echo Done.
