@echo off
setlocal
set "TARGET=I:\yt-dlp\release"

if not exist "%TARGET%" (
  echo Share folder not found:
  echo %TARGET%
  pause
  exit /b 1
)

start "" explorer "%TARGET%"
