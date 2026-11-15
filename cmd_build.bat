@echo off
echo change encoding to utf-8
chcp 65001 >nul
echo build args start
cargo tauri build>build.log 2>&1
set mode=build
echo build args end
copy "..\..\target\release\abclyricsbin.exe" "abclyrics.exe"
echo copy and running
abclyrics.exe