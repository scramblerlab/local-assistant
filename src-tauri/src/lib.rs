mod commands;

use commands::{cloud, fs_ops, mcp, ollama_check, skills, web};
use std::path::PathBuf;
use tauri::Manager;

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
    let skills_dir = commands::fs_ops::app_data_dir(&app.app_handle()).join("skills");
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
        .manage(mcp::McpManager(std::sync::Mutex::new(std::collections::HashMap::new())))
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
            mcp::mcp_start_all,
            mcp::mcp_reload_all,
            mcp::mcp_call_tool,
            cloud::cloud_list_models,
            cloud::cloud_get_capabilities,
            cloud::cloud_get_context_length,
            cloud::cloud_chat_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
