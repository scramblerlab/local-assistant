use scraper::{Html, Selector};

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

fn read_brave_api_key() -> Option<String> {
    let path = dirs_next::home_dir()?.join(".local-assistant").join("config.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let key = json.get("brave_search_api_key")?.as_str()?.trim().to_string();
    if key.is_empty() { None } else { Some(key) }
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


/// Scrape Bing search results. Tries multiple CSS selector strategies since Bing periodically
/// updates its HTML structure.
fn search_bing(client: &reqwest::blocking::Client, query: &str) -> Vec<serde_json::Value> {
    let url = format!(
        "https://www.bing.com/search?q={}&mkt=ja-JP",
        urlencoding::encode(query)
    );
    let body = match client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "ja,en-US;q=0.9,en;q=0.8")
        .send()
        .and_then(|r| r.text())
    {
        Ok(b) => b,
        Err(e) => { eprintln!("[web_search/bing] request failed: {e}"); return vec![]; }
    };
    eprintln!("[web_search/bing] body_len={}", body.len());

    let document = Html::parse_document(&body);
    let title_sel = Selector::parse("h2 a").unwrap();
    let snip_sel = Selector::parse(".b_caption p, .b_algoSlug, [class*='b_caption'] p").unwrap();

    // Try progressively looser container selectors
    for container_str in &["#b_results li.b_algo", "li.b_algo", "li[class*='b_algo']"] {
        let Ok(container_sel) = Selector::parse(container_str) else { continue };
        let mut results = Vec::new();
        for node in document.select(&container_sel).take(5) {
            let title_node = node.select(&title_sel).next();
            let title = title_node
                .map(|n| n.text().collect::<String>().trim().to_string())
                .unwrap_or_default();
            if title.is_empty() { continue; }
            let href = title_node
                .and_then(|n| n.value().attr("href"))
                .unwrap_or_default().to_string();
            let snippet = node.select(&snip_sel).next()
                .map(|n| n.text().collect::<String>().trim().to_string())
                .unwrap_or_default();
            results.push(serde_json::json!({"title": title, "url": href, "snippet": snippet}));
        }
        if !results.is_empty() {
            eprintln!("[web_search/bing] {} results (selector: {})", results.len(), container_str);
            return results;
        }
    }
    eprintln!("[web_search/bing] 0 results");
    vec![]
}

/// DuckDuckGo HTML via POST.
fn search_ddg(client: &reqwest::blocking::Client, query: &str) -> Vec<serde_json::Value> {
    let form = format!("q={}&b=&kl=jp-jp&df=", urlencoding::encode(query));
    let body = match client
        .post("https://html.duckduckgo.com/html")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "ja,en-US;q=0.9,en;q=0.8")
        .header("Referer", "https://duckduckgo.com/")
        .body(form)
        .send()
        .and_then(|r| r.text())
    {
        Ok(b) => b,
        Err(e) => { eprintln!("[web_search/ddg] request failed: {e}"); return vec![]; }
    };
    eprintln!("[web_search/ddg] body_len={}", body.len());

    // A ~14 KB response is DDG's bot-detection page, not results
    if body.len() < 20_000 { return vec![]; }

    let document = Html::parse_document(&body);
    let result_sel = match Selector::parse(".result__body") { Ok(s) => s, Err(_) => return vec![] };
    let title_sel = match Selector::parse(".result__a") { Ok(s) => s, Err(_) => return vec![] };
    let snip_sel = match Selector::parse(".result__snippet") { Ok(s) => s, Err(_) => return vec![] };

    let mut results = Vec::new();
    for node in document.select(&result_sel).take(5) {
        let title_node = node.select(&title_sel).next();
        let title = title_node
            .map(|n| n.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        if title.is_empty() { continue; }
        let href = title_node
            .and_then(|n| n.value().attr("href"))
            .unwrap_or_default().to_string();
        let snippet = node.select(&snip_sel).next()
            .map(|n| n.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        results.push(serde_json::json!({"title": title, "url": href, "snippet": snippet}));
    }
    eprintln!("[web_search/ddg] {} results", results.len());
    results
}

/// DuckDuckGo Lite — simpler HTML, more reliable than the full endpoint.
fn search_ddg_lite(client: &reqwest::blocking::Client, query: &str) -> Vec<serde_json::Value> {
    let url = format!("https://lite.duckduckgo.com/lite/?q={}", urlencoding::encode(query));
    let body = match client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "ja,en-US;q=0.9,en;q=0.8")
        .send()
        .and_then(|r| r.text())
    {
        Ok(b) => b,
        Err(e) => { eprintln!("[web_search/ddg-lite] request failed: {e}"); return vec![]; }
    };
    eprintln!("[web_search/ddg-lite] body_len={}", body.len());

    let document = Html::parse_document(&body);
    let link_sel = match Selector::parse("a.result-link") { Ok(s) => s, Err(_) => return vec![] };
    let snip_sel = match Selector::parse(".result-snippet") { Ok(s) => s, Err(_) => return vec![] };

    let links: Vec<_> = document.select(&link_sel).take(5).collect();
    let snippets: Vec<_> = document.select(&snip_sel).take(5).collect();

    let mut results = Vec::new();
    for (i, link) in links.iter().enumerate() {
        let title = link.text().collect::<String>().trim().to_string();
        if title.is_empty() { continue; }
        let href = link.value().attr("href").unwrap_or_default().to_string();
        let snippet = snippets.get(i)
            .map(|n| n.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        results.push(serde_json::json!({"title": title, "url": href, "snippet": snippet}));
    }
    eprintln!("[web_search/ddg-lite] {} results", results.len());
    results
}

/// Search the web and return top 5 results.
#[tauri::command]
pub fn web_search(query: String) -> Result<Vec<serde_json::Value>, String> {
    let client = make_client()?;

    if let Some(key) = read_brave_api_key() {
        let results = search_brave(&client, &query, &key);
        if !results.is_empty() { return Ok(results); }
    }

    let results = search_ddg(&client, &query);
    if !results.is_empty() { return Ok(results); }

    let results = search_ddg_lite(&client, &query);
    if !results.is_empty() { return Ok(results); }

    let results = search_bing(&client, &query);
    if !results.is_empty() { return Ok(results); }

    eprintln!("[web_search] all strategies exhausted for query={:?}", query);
    Ok(vec![])
}

/// Fetch a URL and return its text content.
/// Non-HTML responses (RSS, JSON, plain text) are returned as-is.
/// HTML responses are stripped down to readable text via semantic selectors.
#[tauri::command]
pub fn web_fetch(url: String) -> Result<String, String> {
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
