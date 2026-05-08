use std::path::PathBuf;
use tauri::Manager;

pub fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| {
        dirs_next::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".local-assistant")
    })
}

pub fn resolve_path_pub(path: &str, app: &tauri::AppHandle) -> PathBuf {
    resolve_path(path, app)
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
            let rest = path[1..].trim_start_matches('/');
            return home.join(rest);
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
    std::fs::write(&p, &content).map_err(|e| format!("write_file error: {e}"))?;
    let written = std::fs::read_to_string(&p)
        .map_err(|e| format!("write_file verification read failed: {e}"))?;
    if written != content {
        return Err(format!("write_file verification failed: content mismatch for {path}"));
    }
    Ok(())
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

#[tauri::command]
pub async fn get_home_dir() -> String {
    dirs_next::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn create_dir(path: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let p = resolve_path(&path, &app_handle);
    std::fs::create_dir_all(&p).map_err(|e| format!("create_dir error: {e}"))?;
    if !p.is_dir() {
        return Err(format!("create_dir verification failed: {path} does not exist after mkdir"));
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_path(from: String, to: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let from_p = resolve_path(&from, &app_handle);
    let to_p = resolve_path(&to, &app_handle);
    if let Some(parent) = to_p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("rename parent mkdir error: {e}"))?;
    }
    std::fs::rename(&from_p, &to_p).map_err(|e| format!("rename_path error: {e}"))?;
    if !to_p.exists() {
        return Err(format!("rename verification failed: {to} does not exist after rename"));
    }
    if from_p.exists() {
        return Err(format!("rename verification failed: {from} still exists after rename"));
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_path(path: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let p = resolve_path(&path, &app_handle);
    if p.is_dir() {
        std::fs::remove_dir_all(&p).map_err(|e| format!("delete_path error: {e}"))?;
    } else {
        std::fs::remove_file(&p).map_err(|e| format!("delete_path error: {e}"))?;
    }
    if p.exists() {
        return Err(format!("delete_path verification failed: {path} still exists after delete"));
    }
    Ok(())
}
