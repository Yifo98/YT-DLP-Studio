@echo off
setlocal
set "TARGET=I:\yt-dlp\cookies"

if not exist "%TARGET%" (
  echo Cookies folder not found:
  echo %TARGET%
  pause
  exit /b 1
)

start "" explorer "%TARGET%"
