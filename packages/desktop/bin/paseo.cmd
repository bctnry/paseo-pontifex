@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "RESOURCES_DIR=%SCRIPT_DIR%.."
set "APP_ROOT=%RESOURCES_DIR%\app.asar.unpacked"
if not exist "%APP_ROOT%" set "APP_ROOT=%RESOURCES_DIR%\app.asar"
set "RUNNER_PATH=%APP_ROOT%\dist\daemon\node-entrypoint-runner.js"
if not exist "%RUNNER_PATH%" set "RUNNER_PATH=%RESOURCES_DIR%\app.asar.unpacked\dist\daemon\node-entrypoint-runner.js"
set "CLI_ENTRYPOINT=%APP_ROOT%\node_modules\@getpaseo\cli\dist\index.js"
set "BUNDLED_NODE=%RESOURCES_DIR%\node.exe"

rem PASEO_DESKTOP_MANAGED marks daemons started through this bundled CLI as
rem desktop-managed, so the desktop app restarts them when it upgrades.
set "PASEO_NODE_ENV=production"
set "PASEO_DESKTOP_MANAGED=1"
set "PASEO_CLI=%~f0"

if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" --disable-warning=DEP0040 "%RUNNER_PATH%" node-script "%CLI_ENTRYPOINT%" %*
  exit /b %errorlevel%
)

set "APP_EXECUTABLE=%RESOURCES_DIR%\..\Paseo.exe"
if not exist "%APP_EXECUTABLE%" (
  echo Bundled Paseo executable not found at %APP_EXECUTABLE% 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%APP_EXECUTABLE%" --disable-warning=DEP0040 "%RUNNER_PATH%" node-script "%CLI_ENTRYPOINT%" %*
exit /b %errorlevel%
