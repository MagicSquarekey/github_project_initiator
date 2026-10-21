@echo off
rem Manager-side windowless launcher for githubPopularProjects.
rem
rem Same semantics as the project's own start.bat:
rem   1. install dependencies on first run
rem   2. npm start (production)
rem   3. fall back to npm run dev if production fails
rem
rem The only difference: start.bat runs `start "" http://localhost:3000`,
rem which pops a browser on EVERY start. That line is intentionally omitted.
rem
rem Usage (see data/registry.json):
rem   cmd /c scripts\start-gpp-hidden.cmd <projectRoot>
rem
rem ASCII-only on purpose: .cmd files are read using the console code page.

if "%~1"=="" exit /b 1
if not exist "%~1" exit /b 1

cd /d "%~1" || exit /b 1

if not exist node_modules call npm install

call npm start
if errorlevel 1 call npm run dev
