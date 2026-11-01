@echo off
chcp 65001 >nul
title Octoopus - Clinic Showcase Silent Render
cd /d "%~dp0"

echo.
echo  خروجی بی‌صدای ریلز معرفی وب‌سایت کلینیک
echo  بدون افکت صوتی، بدون موسیقی و بدون نریشن
echo  لطفاً پنجره را تا پایان رندر نبند.
echo.

node scripts\render.mjs --html ..\projects\clinic-showcase\episode-01\clinic-showcase-test.html --video --fast --out clinic-showcase-silent.mp4

echo.
if errorlevel 1 (
  echo خطا در رندر. متن خطا را برای بررسی بفرست.
) else (
  echo خروجی آماده است: out\clinic-showcase-silent.mp4
)
echo.
pause
