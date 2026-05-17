use std::path::PathBuf;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct GmailAccount {
    pub email: String,
    pub is_active: bool,
}

fn keys_path() -> PathBuf {
    dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".gmail-mcp")
        .join("gcp-oauth.keys.json")
}

fn credentials_path() -> PathBuf {
    dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".gmail-mcp")
        .join("credentials.json")
}

fn accounts_dir() -> PathBuf {
    dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".gmail-mcp")
        .join("accounts")
}

fn account_credentials_path(email: &str) -> PathBuf {
    accounts_dir().join(email).join("credentials.json")
}

fn active_account_path(app_handle: &tauri::AppHandle) -> PathBuf {
    crate::commands::fs_ops::app_data_dir(app_handle).join("gmail_active.txt")
}

fn read_active_account(app_handle: &tauri::AppHandle) -> Option<String> {
    std::fs::read_to_string(active_account_path(app_handle))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn write_active_account(app_handle: &tauri::AppHandle, email: &str) -> std::io::Result<()> {
    std::fs::write(active_account_path(app_handle), email)
}

fn clear_active_account(app_handle: &tauri::AppHandle) {
    let _ = std::fs::remove_file(active_account_path(app_handle));
}

fn list_account_emails() -> Vec<String> {
    let dir = accounts_dir();
    if !dir.exists() {
        return vec![];
    }
    let mut emails: Vec<String> = std::fs::read_dir(&dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let entry = entry.ok()?;
            if entry.file_type().ok()?.is_dir()
                && entry.path().join("credentials.json").exists()
            {
                Some(entry.file_name().to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect();
    emails.sort();
    emails
}

fn save_account_credentials(email: &str) -> Result<(), String> {
    let account_dir = accounts_dir().join(email);
    std::fs::create_dir_all(&account_dir).map_err(|e| e.to_string())?;
    std::fs::copy(credentials_path(), account_dir.join("credentials.json"))
        .map_err(|e| format!("Failed to save account credentials: {e}"))?;
    Ok(())
}

fn activate_account_credentials(email: &str) -> Result<(), String> {
    let src = account_credentials_path(email);
    if !src.exists() {
        return Err(format!("No credentials found for {email}"));
    }
    std::fs::copy(&src, credentials_path())
        .map_err(|e| format!("Failed to activate credentials: {e}"))?;
    Ok(())
}

fn add_to_config(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let config_path = crate::commands::fs_ops::app_data_dir(app_handle).join("config.json");

    let mut config: serde_json::Value = if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let gmail_entry = serde_json::json!({
        "id": "gmail",
        "command": "npx",
        "args": ["-y", "@gongrzhe/server-gmail-autoauth-mcp"]
    });

    let servers = config
        .as_object_mut()
        .ok_or("config is not an object")?
        .entry("mcp_servers")
        .or_insert_with(|| serde_json::json!([]));

    if let Some(arr) = servers.as_array_mut() {
        if let Some(idx) = arr
            .iter()
            .position(|s| s.get("id").and_then(|v| v.as_str()) == Some("gmail"))
        {
            arr[idx] = gmail_entry;
        } else {
            arr.push(gmail_entry);
        }
    }

    let serialized = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, serialized).map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_from_config(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let config_path = crate::commands::fs_ops::app_data_dir(app_handle).join("config.json");
    if !config_path.exists() {
        return Ok(());
    }
    let raw = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}));

    if let Some(arr) = config
        .as_object_mut()
        .and_then(|o| o.get_mut("mcp_servers"))
        .and_then(|v| v.as_array_mut())
    {
        arr.retain(|s| s.get("id").and_then(|v| v.as_str()) != Some("gmail"));
    }

    let serialized = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, serialized).map_err(|e| e.to_string())?;
    Ok(())
}

// --- Commands ---

#[tauri::command]
pub fn gmail_has_keys() -> bool {
    keys_path().exists()
}

#[tauri::command]
pub fn gmail_list_accounts(app_handle: tauri::AppHandle) -> Vec<GmailAccount> {
    let active = read_active_account(&app_handle).unwrap_or_default();
    list_account_emails()
        .into_iter()
        .map(|email| {
            let is_active = email == active;
            GmailAccount { email, is_active }
        })
        .collect()
}

#[tauri::command]
pub async fn gmail_save_keys(content: String) -> Result<(), String> {
    let parsed: serde_json::Value = serde_json::from_str(&content).map_err(|_| {
        "Invalid JSON — make sure you downloaded the OAuth client credentials file, not a service account key.".to_string()
    })?;
    if parsed.get("installed").is_none() && parsed.get("web").is_none() {
        return Err("This doesn't look like a Google OAuth credentials file. Download the OAuth client ID JSON from Google Cloud Console → Credentials.".to_string());
    }
    let dir = dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".gmail-mcp");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("gcp-oauth.keys.json"), content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Runs OAuth for a Gmail account identified by `email`, saves credentials to a
/// per-account directory, and sets it as the active account.
/// The caller is responsible for supplying the correct email address.
#[tauri::command]
pub async fn gmail_add_account(email: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    if !keys_path().exists() {
        return Err("OAuth keys file not found. Please complete the setup wizard first.".to_string());
    }

    let existing_path = std::env::var("PATH").unwrap_or_default();
    let augmented_path = format!(
        "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}",
        existing_path
    );

    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("npx")
            .args(["-y", "@gongrzhe/server-gmail-autoauth-mcp", "auth"])
            .env("PATH", augmented_path)
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Failed to run Gmail auth: {e}"))?;

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = if !stdout.trim().is_empty() { stdout } else { stderr };
        return Err(format!("Gmail auth failed: {detail}"));
    }

    save_account_credentials(&email)?;
    write_active_account(&app_handle, &email).map_err(|e| e.to_string())?;
    add_to_config(&app_handle)?;

    Ok(())
}

#[tauri::command]
pub fn gmail_switch_account(email: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    activate_account_credentials(&email)?;
    write_active_account(&app_handle, &email).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn gmail_remove_account(email: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let account_dir = accounts_dir().join(&email);
    if account_dir.exists() {
        std::fs::remove_dir_all(&account_dir)
            .map_err(|e| format!("Failed to remove account: {e}"))?;
    }

    let active = read_active_account(&app_handle).unwrap_or_default();
    if active == email {
        let remaining = list_account_emails();
        if let Some(next) = remaining.first() {
            activate_account_credentials(next)?;
            write_active_account(&app_handle, next).map_err(|e| e.to_string())?;
        } else {
            clear_active_account(&app_handle);
            let _ = std::fs::remove_file(credentials_path());
            remove_from_config(&app_handle)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn gmail_ensure_config(app_handle: tauri::AppHandle) -> Result<(), String> {
    if credentials_path().exists() && read_active_account(&app_handle).is_some() {
        add_to_config(&app_handle)?;
    }
    Ok(())
}
