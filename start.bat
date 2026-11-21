@echo off
setlocal
title 实验数据工坊 · 本地启动
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本：https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 npm，请重新安装 Node.js。
  pause
  exit /b 1
)

if not exist node_modules (
  echo 首次启动，正在安装依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重新运行本脚本。
    pause
    exit /b 1
  )
)

echo.
echo 正在启动实验数据工坊...
echo 浏览器会自动打开；如未打开，请访问 Vite 在下方输出的地址（默认 http://localhost:5173）。
echo 关闭本窗口或按 Ctrl+C 即可停止服务。
echo.
call npm run dev -- --open

pause
