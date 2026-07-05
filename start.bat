@echo off
cd /d "%~dp0"

set "BUNDLED_NODE=C:\Users\SuleymanAy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "NODE_EXE="

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if "%NODE_EXE%"=="" (
  echo Node.js bulunamadi.
  echo Lutfen https://nodejs.org adresinden Node.js kur.
  pause
  exit /b 1
)

echo Study Universe baslatiliyor...
echo.
echo Bu siyah pencere ACIK kalmali. Kapatirsan site de kapanir.
echo Tarayicidan acilacak adres: http://localhost:3000/kitaplar.html
echo.

start "" "http://localhost:3000/kitaplar.html"
"%NODE_EXE%" server.js

echo.
echo Sunucu kapandi veya baslatilamadi.
echo Eger yukarida EADDRINUSE yaziyorsa port 3000 zaten kullanimda demektir.
pause
