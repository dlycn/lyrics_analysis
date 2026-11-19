use tauri::{Manager};
use tauri_plugin_log::log;
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
///   %APPDATA%\com.abc.lyrics\logs\overlay.log
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
        // 单实例钳制:第二个实例不会真正启动,参数转交首个实例处理。
        // 顺带解决了"二次启动看不见 overlay 特效"的幻觉——它压根没跑。
        .plugin(
            tauri_plugin_single_instance::init(|app, args, cwd| {
                log::info!("二次启动被钳制,接手参数 {:?} cwd={}", args, cwd);
                // 主窗口可被用户关闭,二次启动时把它重新聚起来
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                } else {
                    let _ = tauri::WebviewWindowBuilder::new(
                        app, "main",
                        tauri::WebviewUrl::App("view/index.html".into()))
                        .title("abclyrics studio")
                        .inner_size(1280.0, 960.0)
                        .min_inner_size(960.0, 720.0)
                        .build();
                }
            })
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal) // 默认是 UTC,日志要读本地时间
                .build()
        )
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