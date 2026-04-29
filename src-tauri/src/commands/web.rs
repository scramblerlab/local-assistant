fn read_config_key(field: &str, app: &tauri::AppHandle) -> Option<String> {
    let path = crate::commands::fs_ops::app_data_dir(app).join("config.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let key = json.get(field)?.as_str()?.trim().to_string();
    if key.is_empty() { None } else { Some(key) }
}

fn read_brave_api_key(app: &tauri::AppHandle) -> Option<String> { read_config_key("brave_search_api_key", app) }
fn read_ollama_api_key(app: &tauri::AppHandle) -> Option<String> { read_config_key("ollama_cloud_api_key", app) }

const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

fn make_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(12))
        .gzip(true)
        .deflate(true)
        .cookie_store(true)
        .build()
        .map_err(|e| e.to_string())
}

fn search_brave(client: &reqwest::blocking::Client, query: &str, api_key: &str) -> Vec<serde_json::Value> {
    let url = format!(
        "https://api.search.brave.com/res/v1/web/search?q={}&count=5",
        urlencoding::encode(query)
    );
    let resp = match client
        .get(&url)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("X-Subscription-Token", api_key)
        .send()
    {
        Ok(r) => r,
        Err(e) => { eprintln!("[web_search/brave] request failed: {e}"); return vec![]; }
    };
    if !resp.status().is_success() {
        eprintln!("[web_search/brave] HTTP {}", resp.status());
        return vec![];
    }
    let body = match resp.text() {
        Ok(b) => b,
        Err(e) => { eprintln!("[web_search/brave] read failed: {e}"); return vec![]; }
    };
    let json: serde_json::Value = match serde_json::from_str(&body) {
        Ok(j) => j,
        Err(e) => { eprintln!("[web_search/brave] parse failed: {e}"); return vec![]; }
    };
    let results = json
        .get("web")
        .and_then(|w| w.get("results"))
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter().take(5).map(|item| {
                serde_json::json!({
                    "title":   item.get("title").and_then(|v| v.as_str()).unwrap_or_default(),
                    "url":     item.get("url").and_then(|v| v.as_str()).unwrap_or_default(),
                    "snippet": item.get("description").and_then(|v| v.as_str()).unwrap_or_default(),
                })
            }).collect::<Vec<_>>()
        })
        .unwrap_or_default();
    eprintln!("[web_search/brave] {} results", results.len());
    results
}

fn search_ollama(query: &str, api_key: &str) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({ "query": query, "max_results": 5 }).to_string();
    let resp = client
        .post("https://ollama.com/api/web_search")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("Ollama web search error {}: {}", status, text));
    }
    let text = resp.text().map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let results = json["results"]
        .as_array()
        .map(|arr| {
            arr.iter().take(5).map(|item| serde_json::json!({
                "title":   item["title"].as_str().unwrap_or_default(),
                "url":     item["url"].as_str().unwrap_or_default(),
                "snippet": item["content"].as_str().unwrap_or_default(),
            })).collect::<Vec<_>>()
        })
        .unwrap_or_default();
    eprintln!("[web_search/ollama] {} results", results.len());
    Ok(results)
}

/// Search the web using the specified provider.
#[tauri::command]
pub fn web_search(query: String, provider: Option<String>, app_handle: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    match provider.as_deref() {
        Some("ollama") => {
            let key = read_ollama_api_key(&app_handle)
                .ok_or_else(|| "ollama_cloud_api_key not configured".to_string())?;
            search_ollama(&query, &key)
        }
        Some("brave") => {
            let client = make_client()?;
            let key = read_brave_api_key(&app_handle)
                .ok_or_else(|| "brave_search_api_key not configured".to_string())?;
            Ok(search_brave(&client, &query, &key))
        }
        _ => Err("no_provider".to_string()),
    }
}

/// Fetch a URL and return its text content.
/// Non-HTML responses (RSS, JSON, plain text) are returned as-is.
/// HTML responses are stripped down to readable text via semantic selectors.
#[tauri::command]
pub fn web_fetch(url: String) -> Result<String, String> {
    use scraper::{Html, Selector};

    let client = make_client()?;
    let resp = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "ja,en-US;q=0.9,en;q=0.8")
        .send()
        .map_err(|e| e.to_string())?;

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = resp.text().map_err(|e| e.to_string())?;

    // Non-HTML (RSS/XML, JSON, plain text) — return raw, no scraping needed
    if !content_type.contains("text/html") {
        return Ok(body.chars().take(8000).collect());
    }

    // HTML — extract readable text using semantic selectors
    let document = Html::parse_document(&body);
    let sel = Selector::parse(
        "article, main, p, h1, h2, h3, h4, h5, li, td, th, pre, blockquote, section",
    )
    .unwrap();
    let mut text = String::new();
    for node in document.select(&sel) {
        let t = node.text().collect::<String>();
        let trimmed = t.trim();
        if !trimmed.is_empty() {
            text.push_str(trimmed);
            text.push('\n');
        }
    }
    // Fall back to raw body text if semantic selectors found nothing
    if text.trim().is_empty() {
        if let Some(body_node) = document
            .select(&Selector::parse("body").unwrap())
            .next()
        {
            text = body_node.text().collect::<Vec<_>>().join(" ");
        }
    }
    Ok(text.chars().take(8000).collect())
}
