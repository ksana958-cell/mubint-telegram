@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/4] Installing dependencies...
call npm ci --include=dev --no-audit --no-fund
if errorlevel 1 goto :failed
echo [2/4] Checking TypeScript...
call npm run check
if errorlevel 1 goto :failed
echo [3/4] Building interface...
call npm run build
if errorlevel 1 goto :failed
echo [4/4] Verifying new features...
call npm run verify:build
if errorlevel 1 goto :failed
echo.
echo OK! Return to GitHub Desktop and commit/push changed web files.
pause
exit /b 0
:failed
echo.
echo ERROR: Build did not finish. Do not upload old web files.
pause
exit /b 1
