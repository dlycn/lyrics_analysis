use tauri::{Manager};
use tauri_plugin_opener::OpenerExt;
mod client;
mod midi_ana;
mod network;
/// 用系统默认浏览器打开外部 URL(跨平台:桌面/安卓/iOS 通用)
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener()
    .open_url(url, None::<&str>)
    .map_err(|e| e.to_string())
}

/// 开/关 overlay 悬浮屏的"点击穿透"，返回切换后是否处于穿透状态。
/// 穿透开着的时候鼠标点不到它(透明无边框置顶窗)，要操作它得先关掉穿透。
#[tauri::command]
fn set_overlay_passthrough(app: tauri::AppHandle, passthrough: bool) -> Result<bool, String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or("overlay window not found")?;
    overlay.set_ignore_cursor_events(passthrough).map_err(|e| e.to_string())?;
    Ok(passthrough)
}

/// overlay 无边框窗打不开 DevTools,把前端 console 转成文件日志。
/// 落盘在 app_log_dir(依标识符):Windows 为
///   %APPDATA%\com.dlycn.abcmusic\logs\overlay.log
#[tauri::command]
fn append_log(app: tauri::AppHandle, level: String, msg: String) -> Result<(), String> {
    use std::io::Write;
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("overlay.log"))
        .map_err(|e| e.to_string())?;
    writeln!(f, "[{}] {}", level.to_uppercase(), msg).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
    let builder = tauri::Builder::default()
        // 单实例钳制:第二份启动时,把 argv 转交给已运行实例后自杀退出。
        // 我们场景里主窗口可能被删了只剩 overlay,所以回调里智能唤醒——
        // 有主窗口就唤起主窗口,否则把 overlay(透明悬浮屏)调到最前见个面。
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let _ = cwd;
            tauri_plugin_log::log::info!("收到第二实例启动,argv={:?}", argv);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.set_focus();
            } else if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.set_always_on_top(true);
                let _ = overlay.show();
                let _ = overlay.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new()
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal) // 默认是 UTC,日志要读本地时间
                .build())
        .invoke_handler(tauri::generate_handler![
            open_url,
            set_overlay_passthrough,
            append_log,
            client::set_state
        ]);

    builder.setup(|app: &mut tauri::App| {
        let apphandle = app.handle().clone();
        let chat_core = client::ChatCore::mount(apphandle);
        app.manage(chat_core);
        // 启动悬浮屏:无边框、置顶、固定位置,默认点击穿透
        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.set_ignore_cursor_events(true);
            let _ = overlay.show();
        }
        Ok(())
    }
    ).run(tauri::generate_context!()).expect("运行失败");
}