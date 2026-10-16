@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  if defined SCOUT_PYTHON (
    "%SCOUT_PYTHON%" -m venv .venv
  ) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
    "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m venv .venv
  ) else (
    py -3.12 -m venv .venv
  )
  if errorlevel 1 exit /b 1
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 exit /b 1
)
.venv\Scripts\python.exe -m streamlit run app.py --server.address 127.0.0.1 --server.port 8501 --browser.gatherUsageStats false
