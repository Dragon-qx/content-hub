@echo off
REM ContentHub - one-click Docker startup (production stack).
REM
REM Boots PostgreSQL + Redis + API + Web + Nginx behind a reverse proxy on
REM http://localhost. Builds images if needed and starts detached.
REM
REM Usage:
REM   start.bat            build ^& start detached
REM   start.bat --build    force rebuild
REM   start.bat --down     stop and remove containers
REM   start.bat --clean    stop + wipe named volumes (pgdata, redisdata)

set COMPOSE=docker compose -f docker-compose.prod.yml

if "%~1"=="" goto run
if /i "%~1"=="--build" goto run
if /i "%~1"=="--down" goto down
if /i "%~1"=="--clean" goto clean
echo unknown flag: %~1
echo usage: start.bat [--build^|--down^|--clean]
exit /b 1

:run
echo [contenthub] building ^& starting the stack (detached) ...
%COMPOSE% up -d --build
echo.
echo ==^> ContentHub is up:  http://localhost
echo     Frontend:          /
echo     REST API:          /api/v1
echo     Swagger UI:        /api/docs
echo     Stop:              start.bat --down
echo     Wipe data:         start.bat --clean
pause
exit /b 0

:down
echo [contenthub] stopping stack ...
%COMPOSE% down
pause
exit /b 0

:clean
echo [contenthub] stopping stack and wiping volumes ...
%COMPOSE% down -v
pause
exit /b 0
