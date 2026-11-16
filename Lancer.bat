@echo off
rem Windows : double-cliquer pour lancer l application.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 18 ou plus est requis : https://nodejs.org & pause & exit /b 1)
if not exist node_modules\express (call npm install --omit=dev || (pause & exit /b 1))
call npm start
pause
