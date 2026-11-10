@echo off
chcp 65001 >nul
cargo tauri build>build\build.log 2>&1
set mode=build
copy "..\..\target\release\abclyricsbin.exe" "build\abclyrics.exe"
choice /t 5 /d y /n >nul