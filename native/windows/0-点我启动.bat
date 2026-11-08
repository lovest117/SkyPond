@echo off
chcp 65001>nul
setlocal
cd /d "%~dp0"

if not exist "SkyPond.exe" (
  echo.
  echo  没找到 SkyPond.exe
  echo  多半是只把这份 .bat 从压缩包里拖出来了。
  echo  请把整个压缩包解压成一个文件夹，再双击里面的「0-点我启动.bat」。
  echo.
  pause
  exit /b 1
)

echo  正在打开半亩方塘……
start "" "SkyPond.exe"
exit /b 0
