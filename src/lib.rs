use tauri::path::BaseDirectory;
use tauri::{Manager, State, WebviewWindow};
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

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_url,
            set_overlay_passthrough,
            probe_core
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

// 探针:参数位省略生命周期标注,State<ChatCore> 不带 '_ — 能否通过宏展开与编译?
#[tauri::command]
fn probe_core(core: State<client::ChatCore>) {
    core.set_state(client::ChatState::Online);
}