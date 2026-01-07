@echo off
echo Starting LSPU Medicine Inventory System...
echo Please do not close this window while using the system.
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js version 16 from https://nodejs.org/
    echo.
    pause
    exit
)

:: Create .env file if it doesn't exist
if not exist .env (
    echo Creating configuration file...
    echo PORT=3000>.env
    echo SESSION_SECRET=lspu_medicine_inventory>>.env
    echo NODE_ENV=production>>.env
)

:: Check if node_modules exists, if not run installation
if not exist node_modules\ (
    echo First-time setup: Installing dependencies...
    echo This may take a few minutes...
    echo.
    call npm run install-win
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Installation failed!
        echo Please contact technical support.
        pause
        exit
    )
)

:: Start the server
echo.
echo Starting server...
echo.
echo When you see "Server is running on port 3000", you can open your browser and go to:
echo http://localhost:3000
echo.
echo Default login:
echo Username: admin
echo Password: admin123
echo.
echo To stop the server, close this window.
echo.
npm start

:: If server crashes
echo.
echo Server stopped unexpectedly!
echo.
pause 