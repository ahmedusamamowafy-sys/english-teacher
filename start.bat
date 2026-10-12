@echo off
title My English Teacher
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or this window needs to be reopened. Install it from nodejs.org, then run this file again.
  pause
  exit /b 1
)
start "" http://localhost:3000
echo Starting My English Teacher. Keep this window open while you study. Press Ctrl+C to stop.
node server.js
pause
