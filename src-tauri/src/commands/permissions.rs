use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::fs_ops::app_data_dir;

#[derive(Serialize, Deserialize, Default, Clone)]
struct PermissionStore {
    approved_folders: Vec<String>,
}

fn permissions_path(app: &tauri::AppHandle) -> PathBuf {
    app_data_dir(app).join("file_permissions.json")
}

fn load_store(app: &tauri::AppHandle) -> PermissionStore {
    let path = permissions_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_store(store: &PermissionStore, app: &tauri::AppHandle) -> Result<(), String> {
    let path = permissions_path(app);
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("save permissions error: {e}"))
}

fn resolve_to_canonical(path_str: &str, app: &tauri::AppHandle) -> Option<PathBuf> {
    let p = super::fs_ops::resolve_path_pub(path_str, app);
    Some(p.canonicalize().unwrap_or(p))
}

/// Returns None if new_folder is already covered by an existing entry (no-op).
/// Otherwise prunes any existing sub-paths of new_folder and appends it.
fn optimize_folder_list(mut existing: Vec<String>, new_folder: &str) -> Option<Vec<String>> {
    for f in &existing {
        if new_folder == f.as_str() || new_folder.starts_with(&format!("{f}/")) {
            return None;
        }
    }
    existing.retain(|f| !f.starts_with(&format!("{new_folder}/")));
    existing.push(new_folder.to_string());
    Some(existing)
}

fn is_covered(path: &str, approved: &[String]) -> bool {
    approved.iter().any(|f| path == f.as_str() || path.starts_with(&format!("{f}/")))
}

#[tauri::command]
pub async fn get_file_permissions(app_handle: tauri::AppHandle) -> Vec<String> {
    load_store(&app_handle).approved_folders
}

#[tauri::command]
pub async fn add_file_permission(
    path: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let canonical = resolve_to_canonical(&path, &app_handle)
        .ok_or_else(|| format!("Cannot resolve path: {path}"))?;
    let canonical_str = canonical.to_string_lossy().to_string();
    let store = load_store(&app_handle);
    match optimize_folder_list(store.approved_folders, &canonical_str) {
        None => Ok(load_store(&app_handle).approved_folders),
        Some(new_list) => {
            let updated = PermissionStore { approved_folders: new_list.clone() };
            save_store(&updated, &app_handle)?;
            Ok(new_list)
        }
    }
}

#[tauri::command]
pub async fn remove_file_permission(
    path: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let canonical = resolve_to_canonical(&path, &app_handle)
        .ok_or_else(|| format!("Cannot resolve path: {path}"))?;
    let canonical_str = canonical.to_string_lossy().to_string();
    let mut store = load_store(&app_handle);
    store.approved_folders.retain(|f| f != &canonical_str);
    save_store(&store, &app_handle)?;
    Ok(store.approved_folders)
}

#[tauri::command]
pub async fn check_file_permission(path: String, app_handle: tauri::AppHandle) -> bool {
    let Some(target) = resolve_to_canonical(&path, &app_handle) else {
        return false;
    };
    let target_str = target.to_string_lossy().to_string();
    let store = load_store(&app_handle);
    is_covered(&target_str, &store.approved_folders)
}
