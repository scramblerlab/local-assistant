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

/// Install/upgrade Ollama using the official install script, then restart the server.
/// Returns the new version string on success.
#[tauri::command]
pub async fn upgrade_ollama() -> Result<String, String> {
    let output = std::process::Command::new("sh")
        .args(["-c", "curl -fsSL https://ollama.com/install.sh | sh"])
        .output()
        .map_err(|e| format!("Failed to run install script: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Install script failed:\n{stderr}"));
    }

    // Kill the old running server so the new binary takes over
    let _ = std::process::Command::new("pkill").args(["-x", "ollama"]).output();
    std::thread::sleep(std::time::Duration::from_millis(800));

    // Restart with the new binary
    std::process::Command::new("sh")
        .args(["-c", "nohup ollama serve > /tmp/ollama.log 2>&1 &"])
        .spawn()
        .map_err(|e| format!("Failed to restart ollama: {e}"))?;

    // Wait for it to come up, then read the version
    std::thread::sleep(std::time::Duration::from_secs(2));
    let version = std::process::Command::new("ollama")
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    Ok(version)
}
