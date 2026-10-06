@echo off
rem Daily runner for Windows Task Scheduler. Uses .venv if present.
cd /d "%~dp0.."
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -m realestate run %* >> data\task.log 2>&1
) else (
  python -m realestate run %* >> data\task.log 2>&1
)
