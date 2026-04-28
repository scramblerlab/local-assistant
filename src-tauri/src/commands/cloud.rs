use reqwest::blocking;
use serde_json::Value;
use std::io::BufRead;
use tauri::ipc::Channel;

#[tauri::command]
pub async fn cloud_list_models(api_key: String) -> Result<Vec<Value>, String> {
    tokio::task::spawn_blocking(move || {
        let client = blocking::Client::new();
        let resp = client
            .get("https://ollama.com/api/tags")
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("Cloud API error: {}", resp.status()));
        }

        let body = resp.text().map_err(|e| e.to_string())?;
        let data: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
        Ok(data["models"].as_array().cloned().unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cloud_get_capabilities(name: String, api_key: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let client = blocking::Client::new();
        let body = serde_json::to_string(&serde_json::json!({ "name": name })).unwrap();
        let resp = client
            .post("https://ollama.com/api/show")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Ok(vec![]);
        }

        let text = resp.text().map_err(|e| e.to_string())?;
        eprintln!("[cloud/show] {}", text);
        let data: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let caps = data["capabilities"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        Ok(caps)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cloud_chat_stream(
    model: String,
    messages: Value,
    api_key: String,
    on_chunk: Channel<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let client = blocking::Client::new();
        let body = serde_json::to_string(&serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true
        }))
        .unwrap();

        let resp = client
            .post("https://ollama.com/api/chat")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(format!("Cloud API error {}: {}", status, text));
        }

        let reader = std::io::BufReader::new(resp);
        for line in reader.lines() {
            let line = line.map_err(|e| e.to_string())?;
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() && on_chunk.send(trimmed).is_err() {
                break; // receiver dropped — user aborted
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
