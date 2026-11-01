@echo off
chcp 65001 >nul
title Octoopus - Clinic Showcase Episode 01
cd /d "%~dp0"

echo.
echo  رندر ریلز معرفی وب‌سایت کلینیک با افکت‌های صوتی
echo  بدون موسیقی و بدون نریشن
echo  لطفاً پنجره را تا پایان رندر نبند.
echo.

node scripts\render.mjs --html ..\projects\clinic-showcase\episode-01\clinic-showcase-test.html --video --sfx --out clinic-showcase-episode-01.mp4

echo.
if errorlevel 1 (
  echo خطا در رندر. متن خطا را برای بررسی بفرست.
) else (
  echo خروجی آماده است: template\out\clinic-showcase-episode-01.mp4
)
echo.
pause
