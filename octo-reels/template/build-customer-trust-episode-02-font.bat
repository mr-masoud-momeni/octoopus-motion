@echo off
chcp 65001 >nul
title Octoopus - Customer Trust Episode 02 (Separate SFX)
cd /d "%~dp0"

echo.
echo  رندر قسمت دوم: ویدیوی بی‌صدا + فایل افکت‌های صوتی جداگانه
echo  لطفاً پنجره را تا پایان رندر نبند.
echo.

node scripts\render.mjs --html ..\projects\customer-trust\episode-02-font\v1-sfx-only.html --video --sfx --sfx-separate --out customer-trust-episode-02-font.mp4 --sfx-out customer-trust-episode-02-font-sfx.wav

echo.
if errorlevel 1 (
  echo خطا در رندر. متن خطا را برای بررسی بفرست.
) else (
  echo خروجی ویدیو: template\out\customer-trust-episode-02-font.mp4
  echo خروجی صدا:  template\out\customer-trust-episode-02-font-sfx.wav
)
echo.
pause
