@echo off
setlocal
set "COURSES_ROOT=%~dp0.."
set "PATH=%COURSES_ROOT%\.tools\node-v24.22.2-win-x64;%PATH%"
set "NEXT_TELEMETRY_DISABLED=1"
if exist "%COURSES_ROOT%\.tools\jdk\jdk-21.0.13+9\bin\java.exe" set "JAVA_HOME=%COURSES_ROOT%\.tools\jdk\jdk-21.0.13+9"
if not exist "%COURSES_ROOT%\.tools\node-v24.22.2-win-x64\node.exe" (
  echo Outils absents. Executer node scripts/bootstrap.mjs avant cette commande.
  exit /b 1
)
pushd "%COURSES_ROOT%"
call npm.cmd %*
set "COURSES_RESULT=%ERRORLEVEL%"
popd
exit /b %COURSES_RESULT%
