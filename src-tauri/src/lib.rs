use std::fs;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[tauri::command]
async fn register_focus_shortcut(app: tauri::AppHandle, shortcut_str: String) -> Result<(), String> {
    let shortcut: tauri_plugin_global_shortcut::Shortcut = shortcut_str
        .parse()
        .map_err(|e| format!("invalid shortcut: {e}"))?;
    let _ = app.global_shortcut().unregister_all();
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .map_err(|e| format!("register error: {e}"))
}

#[tauri::command]
async fn unregister_focus_shortcut(app: tauri::AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("unregister error: {e}"))
}

#[tauri::command]
async fn load_data(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir error: {e}"))?;
    let path = dir.join("data.json");
    if !path.exists() {
        return Ok(serde_json::Value::Null);
    }
    let s = fs::read_to_string(&path).map_err(|e| format!("read error: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&s).map_err(|e| format!("parse error: {e}"))?;
    Ok(v)
}

#[tauri::command]
async fn save_data(app: tauri::AppHandle, data: serde_json::Value) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir error: {e}"))?;
    let path = dir.join("data.json");
    let tmp = dir.join("data.json.tmp");
    let s = serde_json::to_string_pretty(&data).map_err(|e| format!("serialize error: {e}"))?;
    fs::write(&tmp, s).map_err(|e| format!("write error: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename error: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            register_focus_shortcut,
            unregister_focus_shortcut
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
