@echo off
chcp 65001 >nul
title Octoopus - Clinic Showcase SFX Track
cd /d "%~dp0"

echo.
echo  ساخت فایل مستقل افکت‌های صوتی ریلز کلینیک
echo  این دستور ویدئو را رندر نمی‌کند.
echo.

node scripts\clinic-showcase-sfx.mjs

echo.
if errorlevel 1 (
  echo خطا در ساخت فایل افکت‌ها. متن خطا را برای بررسی بفرست.
) else (
  echo فایل افکت‌ها آماده است: out\clinic-showcase-sfx.wav
)
echo.
pause
