@echo off
chcp 65001 >nul
cargo tauri dev>build\debug.log 2>&1
set mode=debug
copy "..\..\target\debug\abclyricsbin.exe" "build\abclyrics_%mode%.exe"
choice /t 5 /d y /n >nul