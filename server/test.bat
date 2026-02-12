@echo off
echo 🚀 Starting Server in a new window...
start "DUYDODEE Server" cmd /k "npm start"

echo ⏳ Waiting 5 seconds for server to launch...
timeout /t 5 /nobreak >nul

echo 🧪 Running Login Tests...
call npm test

echo.
echo ---------------------------------------------------
echo ℹ️  Server is running in the other window.
pause