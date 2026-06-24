@echo off
chcp 65001 >nul
title Jarvisplitwise
cd /d "%~dp0"
echo.
echo   ============================================
echo    Jarvisplitwise 啟動中…瀏覽器會自動開啟
echo.
echo    用完後,關閉這個黑色視窗即可停止。
echo   ============================================
echo.
rem 2 秒後自動開啟瀏覽器 (等伺服器就緒)
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:8000"
rem 啟動本機伺服器 (這個視窗就是伺服器, 關掉=停止)
python -m http.server 8000
