::[Bat To Exe Converter]
::
::YAwzoRdxOk+EWAjk
::fBw5plQjdCyDJGyX8VAjFBBbTQiDOHm/D4k45//14+WGpl4hWPEvbbDX1bOBH7Qg5XrtdpkjmHNZl6s=
::YAwzuBVtJxjWCl3EqQJgSA==
::ZR4luwNxJguZRRnk
::Yhs/ulQjdF+5
::cxAkpRVqdFKZSDk=
::cBs/ulQjdFm5
::ZR41oxFsdFKZSDk=
::eBoioBt6dFKZSDk=
::cRo6pxp7LAbNWATEpCI=
::egkzugNsPRvcWATEpCI=
::dAsiuh18IRvcCxnZtBJQ
::cRYluBh/LU+EWAnk
::YxY4rhs+aU+JeA==
::cxY6rQJ7JhzQF1fEqQJQ
::ZQ05rAF9IBncCkqN+0xwdVs0
::ZQ05rAF9IAHYFVzEqQJQ
::eg0/rx1wNQPfEVWB+kM9LVsJDGQ=
::fBEirQZwNQPfEVWB+kM9LVsJDGQ=
::cRolqwZ3JBvQF1fEqQJQ
::dhA7uBVwLU+EWDk=
::YQ03rBFzNR3SWATElA==
::dhAmsQZ3MwfNWATElA==
::ZQ0/vhVqMQ3MEVWAtB9wSA==
::Zg8zqx1/OA3MEVWAtB9wSA==
::dhA7pRFwIByZRRnk
::Zh4grVQjdCyDJGyX8VAjFBBbTQiDOHm/D4k45//14+WGpl4heNEPTc/237CHI+kd7wXNe4Ao2G5VitJMPwJLahemIAosrA4=
::YB416Ek+ZG8=
::
::
::978f952a14a936cc963da21a135fa983
@echo off
title LSPU Medicine Inventory System
color 1F
mode con: cols=80 lines=25

echo.
echo    Starting LSPU Medicine Inventory System...
echo    Please wait...

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 4F
    cls
    echo.
    echo    ERROR: Node.js is not installed!
    echo    Please install Node.js version 16 from https://nodejs.org/
    echo.
    echo    Press any key to open the Node.js download page...
    pause >nul
    start https://nodejs.org/
    exit
)

:: Create .env file if it doesn't exist
if not exist .env (
    echo PORT=3000>.env
    echo SESSION_SECRET=lspu_medicine_inventory>>.env
    echo NODE_ENV=production>>.env
)

:: Check if node_modules exists, if not run installation
if not exist node_modules\ (
    cls
    echo.
    echo    First-time setup: Installing dependencies...
    echo    This may take a few minutes...
    echo.
    call npm run install-win
    if %ERRORLEVEL% NEQ 0 (
        color 4F
        cls
        echo.
        echo    ERROR: Installation failed!
        echo    Please contact technical support.
        pause
        exit
    )
)

:: Start the server in hidden window
start /min cmd /c "npm start"

:: Wait for server to start
timeout /t 5 /nobreak > nul

:: Check if server started successfully
netstat -ano | find ":3000" | find "LISTENING" > nul
if %ERRORLEVEL% NEQ 0 (
    color 4F
    cls
    echo.
    echo    ERROR: Failed to start server!
    echo    Please contact technical support.
    pause
    exit
)

:: Start browser and minimize this window
powershell -window minimized -command ""
start /max http://localhost:3000

:: Monitor browser
:MONITOR
:: Get Chrome PID if it's running and accessing localhost:3000
for /f "tokens=5" %%a in ('netstat -ano ^| find ":3000" ^| find "ESTABLISHED"') do (
    :: Check if the PID belongs to Chrome
    tasklist /fi "PID eq %%a" /fi "IMAGENAME eq chrome.exe" | find "chrome.exe" >nul
    if !ERRORLEVEL! EQU 0 (
        set "BROWSER_RUNNING=1"
        goto CHECK_BROWSER
    )
)

:: Get Edge PID if it's running and accessing localhost:3000
for /f "tokens=5" %%a in ('netstat -ano ^| find ":3000" ^| find "ESTABLISHED"') do (
    :: Check if the PID belongs to Edge
    tasklist /fi "PID eq %%a" /fi "IMAGENAME eq msedge.exe" | find "msedge.exe" >nul
    if !ERRORLEVEL! EQU 0 (
        set "BROWSER_RUNNING=1"
        goto CHECK_BROWSER
    )
)

:: Get Firefox PID if it's running and accessing localhost:3000
for /f "tokens=5" %%a in ('netstat -ano ^| find ":3000" ^| find "ESTABLISHED"') do (
    :: Check if the PID belongs to Firefox
    tasklist /fi "PID eq %%a" /fi "IMAGENAME eq firefox.exe" | find "firefox.exe" >nul
    if !ERRORLEVEL! EQU 0 (
        set "BROWSER_RUNNING=1"
        goto CHECK_BROWSER
    )
)

set "BROWSER_RUNNING=0"

:CHECK_BROWSER
if "%BROWSER_RUNNING%"=="0" (
    :: Browser closed, stop server
    for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
    exit
) else (
    :: Browser still running, continue monitoring
    timeout /t 2 /nobreak >nul
    goto MONITOR
) 