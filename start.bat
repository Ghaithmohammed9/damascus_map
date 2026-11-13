@echo off
chcp 65001 >nul
title Kharait Al-Sham - Damascus Map
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

REM If the app is already served, just open the browser
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 goto run

echo.
echo   App is already running - opening the browser...
start "" "http://127.0.0.1:4173/"
timeout /t 2 >nul
exit /b 0

:run
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173/'"
echo.
echo   ==================================================
echo      Kharait Al-Sham  -  Damascus map
echo      Local :  http://127.0.0.1:4173
echo.
echo      From your phone (same Wi-Fi): use the LAN URL below
echo      Keep this window open - it IS the server.
echo      Ctrl+C to stop.
echo   ==================================================
echo.
node tools/serve.js --port 4173 --host 0.0.0.0
echo.
echo   Server stopped.
pause
exit /b 0

:nonode
echo.
echo   Node.js is not installed.
echo   Download it from https://nodejs.org  (LTS version)
echo   then run this file again.
echo.
pause
exit /b 1
