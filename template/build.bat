@echo off
chcp 65001 >nul
title Octoopus - ساخت ریلز
cd /d "%~dp0"

echo.
echo  ۱) فایل صدا رو توی پوشهٔ audio بذار (اسمش هر چیزی باشه، مثلاً voice.wav)
echo  ۲) این پنجره رو باز بذار تا ویدیو ساخته شه (چند دقیقه طول می‌کشه)
echo.

node scripts\build.mjs %*

echo.
pause
