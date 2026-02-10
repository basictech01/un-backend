@echo off
REM Article Management Test Suite for Windows

setlocal enabledelayedexpansion

echo.
echo ================================================
echo   Un-Backend Article Management Tests
echo ================================================
echo.

REM Check if Newman is installed
where newman >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Newman not found. Installing globally...
    call npm install -g newman
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install Newman
        exit /b 1
    )
)

REM Define paths
set SCRIPT_DIR=%~dp0
set COLLECTION=%SCRIPT_DIR%collection.json
set ENVIRONMENT=%SCRIPT_DIR%environment.json
set REPORT=%SCRIPT_DIR%test-report.html

REM Verify files exist
if not exist "%COLLECTION%" (
    echo [ERROR] Collection file not found: %COLLECTION%
    exit /b 1
)

if not exist "%ENVIRONMENT%" (
    echo [ERROR] Environment file not found: %ENVIRONMENT%
    exit /b 1
)

echo [INFO] Collection:  %COLLECTION%
echo [INFO] Environment: %ENVIRONMENT%
echo [INFO] Report:      %REPORT%
echo.

echo Running tests...
echo ================================================
echo.

REM Run Newman
call newman run "%COLLECTION%" ^
  --environment "%ENVIRONMENT%" ^
  --reporters cli,html ^
  --reporter-html-export "%REPORT%" ^
  --timeout-request 10000 ^
  --timeout 30000 ^
  --bail

set STATUS=%errorlevel%

echo.
echo ================================================
echo.

if %STATUS% equ 0 (
    echo [SUCCESS] All tests passed!
    echo [INFO] HTML report: %REPORT%
    exit /b 0
) else (
    echo [ERROR] Tests failed with exit code: %STATUS%
    echo [INFO] Check HTML report: %REPORT%
    exit /b 1
)

endlocal
