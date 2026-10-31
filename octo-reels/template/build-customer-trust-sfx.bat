@echo off
chcp 65001 >nul
title Octoopus - Customer Trust Episode 01 (SFX only)
cd /d "%~dp0"

echo.
echo  رندر ویدیوی قسمت اول با افکت صوتی، بدون موسيقی و بدون گفتار
echo  لطفاً پنجره را تا پایان رندر نبند.
echo.

node scripts\render.mjs --html ..\projects\customer-trust\episode-01-slider\v7-sfx-only.html --video --sfx --out customer-trust-episode-01.mp4

echo.
if errorlevel 1 (
  echo خطا در رندر. متن خطا را برای بررسی بفرست.
) else (
  echo خروجی آماده است: template\out\customer-trust-episode-01.mp4
)
echo.
pause
