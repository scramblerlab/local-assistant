#[tauri::command]
pub async fn check_ollama_installed() -> bool {
    // Check common locations
    let candidates = [
        "/opt/homebrew/bin/ollama",
        "/usr/local/bin/ollama",
        "/usr/bin/ollama",
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return true;
        }
    }
    // Also check via which
    std::process::Command::new("which")
        .arg("ollama")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn start_ollama_server() -> Result<(), String> {
    std::process::Command::new("sh")
        .args(["-c", "nohup ollama serve > /tmp/ollama.log 2>&1 &"])
        .spawn()
        .map_err(|e| format!("Failed to start ollama: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn open_ollama_download() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("https://ollama.com/download")
        .spawn()
        .map_err(|e| format!("Failed to open browser: {e}"))?;
    Ok(())
}
