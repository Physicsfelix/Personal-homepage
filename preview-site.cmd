@echo off
chcp 65001 >nul
where quarto >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Quarto。请先按照 README.md 安装 Quarto，然后再双击本文件。
  pause
  exit /b 1
)

echo 正在打开网站预览。保持这个窗口开启，保存文件后网页会自动刷新。
quarto preview
