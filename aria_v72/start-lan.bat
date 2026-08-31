@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Aria Local Server

set "HOST=0.0.0.0"
set "PORT=3000"
if not defined ADMIN_USER set "ADMIN_USER=admin"

echo.
echo ============================================
echo   Aria Coffee Shop - Local Server
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js nasb nist ya dar PATH peyda nashod.
  echo Node.js 22.13 ya jadidtar nasb kon va dobare in file ro ejra kon.
  goto :fail
)

for /f "tokens=1,2 delims=." %%A in ('node -p "process.versions.node"') do (
  set "NODE_MAJOR=%%A"
  set "NODE_MINOR=%%B"
)

echo Node.js:
node -v

if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Version Node.js ghadimie.
  echo Minimum required: Node.js 22.13
  goto :fail
)
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 13 (
  echo [ERROR] Version Node.js ghadimie.
  echo Minimum required: Node.js 22.13
  goto :fail
)

if not defined ADMIN_PASSWORD (
  echo.
  echo Ramze panel ro vared kon ^(hadeaghal 12 character^):
  set /p "ADMIN_PASSWORD=> "
)

if not defined ADMIN_PASSWORD (
  echo [ERROR] Ramz khali ast.
  goto :fail
)

for /f %%L in ('powershell -NoProfile -Command "$env:ADMIN_PASSWORD.Length" 2^>nul') do set "PASSLEN=%%L"
if not defined PASSLEN (
  echo [ERROR] Tool ramz ghabele barresi nist.
  goto :fail
)
if %PASSLEN% LSS 12 (
  echo [ERROR] Ramze panel bayad hadeaghal 12 character bashe.
  goto :fail
)

set "IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /R /C:"IPv4 Address" /C:"IPv4"') do (
  if not defined IP set "IP=%%A"
)
set "IP=%IP: =%"

echo.
echo ============================================
echo   Server is running
echo   PC:     http://localhost:%PORT%
if defined IP echo   Mobile: http://%IP%:%PORT%
echo   Admin:  http://localhost:%PORT%/admin
echo ============================================
echo.
echo Baraye stop kardan server Ctrl+C bezan.
echo.

rem Node 22.13 va har version jadidtar mostaghim ejra mishe.
node server.js

:server_finished
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo ============================================
echo Server stop shod. Exit code: %EXIT_CODE%
echo ============================================
goto :end

:fail
echo.
echo Site ejra nashod. Error bala ro check kon.

:end
echo.
pause
endlocal
