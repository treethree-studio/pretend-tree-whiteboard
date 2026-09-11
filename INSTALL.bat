@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Pretend Tree Whiteboard - Installer

echo.
echo ===============================================
echo   Pretend Tree Whiteboard - Windows Installer
echo ===============================================
echo.
echo Package folder:
echo %CD%
echo.

if not exist "app\main.js" (
  echo [ERROR] app\main.js was not found.
  echo Please extract the entire ZIP first, then run INSTALL.bat again.
  echo.
  pause
  exit /b 2
)

if not exist "installer\install.ps1" (
  echo [ERROR] installer\install.ps1 was not found.
  echo Please extract the entire ZIP first.
  echo.
  pause
  exit /b 3
)

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  echo.
  pause
  exit /b 4
)

echo Starting installer...
echo The first install downloads about 151 MB of Electron runtime.
echo Keep this window open.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%CD%\installer\install.ps1"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] Installer finished.
) else (
  echo [ERROR] Installer returned code %RC%.
  echo Check install-log.txt in this folder.
)
echo.
pause
exit /b %RC%
