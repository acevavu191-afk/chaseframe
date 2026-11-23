@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 追帧 ChaseFrame - 本地服务器
echo.
echo 电脑访问: http://localhost:8099
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo 手机访问: http:%%a:8099
echo.
echo 按 Ctrl+C 停止
python -m http.server 8099
pause
