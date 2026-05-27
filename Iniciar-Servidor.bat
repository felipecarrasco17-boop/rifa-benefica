@echo off
title Servidor Rifa Benefica
echo ===================================================
echo   Iniciando Servidor de la Rifa Benefica...
echo ===================================================
echo.
set PATH=c:\Users\felip\Documents\node-portable;%PATH%
cd /d "c:\Users\felip\Documents\rifa-benefica"
start http://localhost:3000
npm run dev
pause
