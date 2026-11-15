use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
mod midi_ana;
/// 用系统默认浏览器打开外部 URL(跨平台:桌面/安卓/iOS 通用)
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app
    .opener()
    .open_url(url, None::<&str>)
    .map_err(|e| e.to_string())
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![open_url,])
        .setup(|app| {
            let resource_path = app
                .path()
                .resolve("assets/lyrics", BaseDirectory::Resource)?;
            println!("lyrics path: {:?}", resource_path);
            Ok(())
        }
    );
    builder.run(tauri::generate_context!()).expect("运行失败");
}