
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

// ---------------------------------------------------------------------------
// 本地 SoundFont 协议：abcjs synth 通过 http://sf.localhost/FluidR3_GM/... 取音源
// ---------------------------------------------------------------------------
fn soundfont_root(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("ABCLYRICS_SOUNDFONT_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() {
            return Some(p);
        }
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(app) = app {
        if let Ok(res) = app.path().resource_dir() {
            candidates.push(res.join("assets").join("soundfonts"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("assets").join("soundfonts"));
        candidates.push(cwd.join("server").join("abclyrics").join("assets").join("soundfonts"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("assets")
            .join("soundfonts"),
    );
    candidates.into_iter().find(|c| c.join("FluidR3_GM").exists())
}



pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("运行失败");
}

