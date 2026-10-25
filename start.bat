@echo off
setlocal
title Octopath Helper — Live Telemetry Tracker

echo ========================================================
echo   OCTOPATH HELPER — LIVE TELEMETRY & 100%% TRACKER (v0.1)
echo ========================================================
echo.

:: 1. Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found on your system.
    echo Please install Node.js from https://nodejs.org/ and re-run.
    echo.
    pause
    exit /b 1
)

:: 2. Check for root node_modules
if not exist "node_modules\" (
    echo [Setup] First-time launch: installing backend dependencies...
    call npm install
)

:: 3. Check for compiled frontend distribution
if not exist "client\dist\" (
    echo [Setup] Building client production bundle...
    if not exist "client\node_modules\" (
        call npm --prefix client install
    )
    call npm --prefix client run build
)

echo [Octopath Helper] Starting server on http://localhost:3001 ...
echo [Octopath Helper] Opening companion dashboard in your default browser...

:: Open browser automatically
start "" http://localhost:3001

:: Start the unified server
node server/index.js

pause
