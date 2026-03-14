@echo off
setlocal
set "APP_DIR=I:\yt-dlp\release\win-unpacked"
set "APP_EXE=%APP_DIR%\YT-DLP Studio.exe"

if not exist "%APP_EXE%" (
  echo YT-DLP Studio.exe not found:
  echo %APP_EXE%
  pause
  exit /b 1
)

start "" "%APP_EXE%"
