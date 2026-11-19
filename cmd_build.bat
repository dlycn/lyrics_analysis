@echo off
echo %time% build start
echo %time% change encoding to utf-8
chcp 65001 >nul
echo %time% build args start
cargo tauri build>test\build.log 2>&1
echo %time% build args end
rem 切到 release 目录(资源 lyrics/soundfonts 所在处),再从独立进程启动 exe,
rem 避免 cmd 控制台占用 / CWD 错误导致 asset.localhost 访不到本地资源。
pushd "..\..\target\release"
start "abcmusic" "abcmusicbin.exe"
popd
echo %time% running now