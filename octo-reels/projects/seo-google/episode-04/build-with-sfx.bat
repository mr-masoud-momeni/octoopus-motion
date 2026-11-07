@echo off
setlocal
set "TEMPLATE=%~dp0..\..\..\template"

echo Rendering silent MP4 (SFX remain preview-only in HTML)...
node "%TEMPLATE%\scripts\render.mjs" --html "%~dp0reel-01.html" --video --out reel-01.mp4
if errorlevel 1 (
  echo.
  echo Render failed. Check that Node.js, Chrome and FFmpeg are installed.
  pause
  exit /b 1
)

copy /Y "%TEMPLATE%\out\reel-01-no-sfx.mp4" "%~dp0reel-01.mp4" >nul
echo.
echo Done: %~dp0reel-01.mp4
pause
