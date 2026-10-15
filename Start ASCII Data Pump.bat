@echo off
cd /d "%~dp0"
python ascii_data_pump_server.py
if errorlevel 1 (
  echo.
  echo ASCII Data Pump stopped because the local server could not start.
  pause
)
