@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:8767 in Firefox. Press Ctrl+C to stop.
py -3 -m http.server 8767 --bind 127.0.0.1 --directory web
if errorlevel 1 pause
