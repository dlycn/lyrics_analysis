@echo off
chcp 65001 >nul
cargo tauri dev>debug.log 2>&1
set mode=debug
copy "..\..\target\debug\abcmusicbin.exe" "abcmusic_%mode%.exe"
choice /t 5 /d y /n >nul