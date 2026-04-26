mod commands;

use commands::{fs_ops, ollama_check, skills, web};
use tauri::Manager;
use std::path::PathBuf;

fn copy_dir_all(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), dest_path)?;
        }
    }
    Ok(())
}

fn setup_user_data(app: &tauri::App) {
    let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let skills_dir = home.join(".local-assistant").join("skills");
    let _ = std::fs::create_dir_all(&skills_dir);

    // Copy bundled skill-creator on first launch
    let skill_creator_dst = skills_dir.join("skill-creator");
    if !skill_creator_dst.exists() {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let skill_creator_src = resource_dir.join("skills").join("skill-creator");
            if skill_creator_src.exists() {
                let _ = copy_dir_all(&skill_creator_src, &skill_creator_dst);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            setup_user_data(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            skills::list_skills,
            skills::read_skill_file,
            fs_ops::read_file,
            fs_ops::write_file,
            fs_ops::list_dir,
            ollama_check::check_ollama_installed,
            ollama_check::start_ollama_server,
            ollama_check::open_ollama_download,
            ollama_check::upgrade_ollama,
            web::web_search,
            web::web_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
