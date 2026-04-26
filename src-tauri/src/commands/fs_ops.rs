use std::path::PathBuf;

fn resolve_path(path: &str) -> PathBuf {
    if path.starts_with('~') {
        if let Some(home) = dirs_next::home_dir() {
            return home.join(&path[2..]);
        }
    }
    PathBuf::from(path)
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let p = resolve_path(&path);
    std::fs::read_to_string(&p).map_err(|e| format!("read_file error: {e}"))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let p = resolve_path(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create_dir error: {e}"))?;
    }
    std::fs::write(&p, content).map_err(|e| format!("write_file error: {e}"))
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<String>, String> {
    let p = resolve_path(&path);
    let entries = std::fs::read_dir(&p).map_err(|e| format!("list_dir error: {e}"))?;
    Ok(entries
        .filter_map(|e| e.ok())
        .map(|e| e.path().to_string_lossy().to_string())
        .collect())
}
