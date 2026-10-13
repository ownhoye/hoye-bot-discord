@echo off
setlocal enabledelayedexpansion
title LoliCord - Discord Log Viewer
color 0A

echo ================================================
echo  LoliCord - Discord Log Viewer
echo ================================================
echo.

set DISCORD_ROOT=%LOCALAPPDATA%\Discord
set LOG_DIR=%APPDATA%\discord\logs

rem -- Verifier que Discord est installe
if not exist "%DISCORD_ROOT%" (
    echo [ERROR] Discord non trouve : %DISCORD_ROOT%
    pause
    exit /b 1
)

rem -- Fermer Discord proprement pour que Chromium flush son stockage de session (evite toute deconnexion)
tasklist /FI "IMAGENAME eq Discord.exe" 2>nul | find /i "Discord.exe" >nul
if not errorlevel 1 (
    echo [INFO] Fermeture propre de Discord en cours...
    if exist "%DISCORD_ROOT%\Update.exe" (
        "%DISCORD_ROOT%\Update.exe" --processStop Discord.exe >nul 2>&1
        timeout /t 3 /nobreak >nul
    )
    tasklist /FI "IMAGENAME eq Discord.exe" 2>nul | find /i "Discord.exe" >nul
    if not errorlevel 1 (
        taskkill /IM Discord.exe >nul 2>&1
        timeout /t 2 /nobreak >nul
    )
    tasklist /FI "IMAGENAME eq Discord.exe" 2>nul | find /i "Discord.exe" >nul
    if not errorlevel 1 (
        taskkill /F /IM Discord.exe /T >nul 2>&1
        timeout /t 1 /nobreak >nul
    )
)

rem -- Trouver le dossier app-* le plus recent (tri descendant par nom)
set APP_DIR=
for /f "delims=" %%i in ('dir /b /ad /o-n "%DISCORD_ROOT%\app-*" 2^>nul') do (
    if "!APP_DIR!"=="" set APP_DIR=%%i
)

if "!APP_DIR!"=="" (
    echo [ERROR] Aucun dossier app-* trouve dans %DISCORD_ROOT%
    pause
    exit /b 1
)

set DISCORD_EXE=%DISCORD_ROOT%\!APP_DIR!\Discord.exe

if not exist "!DISCORD_EXE!" (
    echo [ERROR] Discord.exe introuvable : !DISCORD_EXE!
    pause
    exit /b 1
)

echo [INFO] Version  : !APP_DIR!
echo [INFO] Exe      : !DISCORD_EXE!
echo [INFO] Logs     : !LOG_DIR!
echo.

rem -- Lancer Discord avec logging Chromium/Electron active
echo [INFO] Lancement de Discord avec --enable-logging...
start "" "!DISCORD_EXE!" --enable-logging --log-level=0

echo [INFO] Attente 6s pour l'initialisation de Discord...
timeout /t 6 /nobreak > nul
echo.

rem -- Verifier que le dossier de logs existe
if not exist "!LOG_DIR!" (
    echo [WARN] Dossier de logs introuvable : !LOG_DIR!
    echo        Discord a peut-etre change le chemin. Attendre et relancer.
    pause
    exit /b
)

echo [INFO] Stream en temps reel - Ctrl+C pour arreter
echo [INFO] Pour copier : clic droit sur la barre de titre ^> Selectionner tout ^> Entree
echo ================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$logDir = '!LOG_DIR!'; " ^
    "$f = Get-ChildItem $logDir -Filter '*.log' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; " ^
    "if ($f) { " ^
    "    Write-Host ('>>> Fichier : ' + $f.FullName) -ForegroundColor Cyan; " ^
    "    Write-Host '>>> Ctrl+C pour arreter le stream' -ForegroundColor Yellow; " ^
    "    Write-Host ''; " ^
    "    Get-Content $f.FullName -Wait -Tail 500 " ^
    "} else { " ^
    "    Write-Host ('[ERREUR] Aucun fichier .log trouve dans : ' + $logDir) -ForegroundColor Red; " ^
    "    Write-Host 'Discord vient peut-etre de demarrer, relancer ce script.' -ForegroundColor Yellow " ^
    "}"

endlocal
pause
