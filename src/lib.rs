
use std::path::PathBuf;
use tauri::Manager;
mod midi_ana;
/// 用系统默认浏览器打开外部 URL
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
    let mut builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_url,
        ]);
    builder
        .run(tauri::generate_context!())
        .expect("运行失败");
}