@echo off
rem Kinora: install (first run), build and start on http://localhost:8000
cd /d "%~dp0"

if not exist backend\.venv (
  echo [1/3] Installing Python packages...
  py -m venv backend\.venv || goto :error
  backend\.venv\Scripts\python -m pip install -q -r backend\requirements.txt || goto :error
)

if not exist frontend\node_modules (
  echo [2/3] Installing npm packages...
  pushd frontend
  call npm install || goto :error
  popd
)

echo [3/3] Building the interface...
pushd frontend
call npm run build || goto :error
popd

echo.
echo Ready! Open http://localhost:8000
echo Stop: Ctrl+C
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
goto :eof

:error
echo Install or build failed, see the messages above.
pause
