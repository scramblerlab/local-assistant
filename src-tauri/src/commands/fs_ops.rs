use std::path::PathBuf;
use tauri::Manager;

pub fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| {
        dirs_next::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".local-assistant")
    })
}

fn resolve_path(path: &str, app: &tauri::AppHandle) -> PathBuf {
    // Map ~/.local-assistant/ → sandbox-safe app data directory
    if path == "~/.local-assistant"
        || path.starts_with("~/.local-assistant/")
    {
        let rest = &path["~/.local-assistant".len()..];
        return app_data_dir(app).join(rest.trim_start_matches('/'));
    }
    if path.starts_with('~') {
        if let Some(home) = dirs_next::home_dir() {
            return home.join(&path[2..]);
        }
    }
    PathBuf::from(path)
}

#[tauri::command]
pub async fn read_file(path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let p = resolve_path(&path, &app_handle);
    std::fs::read_to_string(&p).map_err(|e| format!("read_file error: {e}"))
}

#[tauri::command]
pub async fn write_file(path: String, content: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let p = resolve_path(&path, &app_handle);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create_dir error: {e}"))?;
    }
    std::fs::write(&p, content).map_err(|e| format!("write_file error: {e}"))
}

#[tauri::command]
pub async fn list_dir(path: String, app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let p = resolve_path(&path, &app_handle);
    let entries = std::fs::read_dir(&p).map_err(|e| format!("list_dir error: {e}"))?;
    Ok(entries
        .filter_map(|e| e.ok())
        .map(|e| e.path().to_string_lossy().to_string())
        .collect())
}
