use scraper::{Html, Selector};

fn make_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

/// Search the web using DuckDuckGo HTML and return top results.
#[tauri::command]
pub fn web_search(query: String) -> Result<Vec<serde_json::Value>, String> {
    let client = make_client()?;
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(&query)
    );
    let body = client
        .get(&url)
        .send()
        .map_err(|e| e.to_string())?
        .text()
        .map_err(|e| e.to_string())?;

    let document = Html::parse_document(&body);
    let result_sel = Selector::parse(".result__body").unwrap();
    let title_sel = Selector::parse(".result__a").unwrap();
    let snippet_sel = Selector::parse(".result__snippet").unwrap();
    let url_sel = Selector::parse(".result__url").unwrap();

    let mut results = Vec::new();
    for node in document.select(&result_sel).take(5) {
        let title = node
            .select(&title_sel)
            .next()
            .map(|n| n.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        let snippet = node
            .select(&snippet_sel)
            .next()
            .map(|n| n.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        let href = node
            .select(&url_sel)
            .next()
            .map(|n| n.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        if title.is_empty() { continue; }
        results.push(serde_json::json!({
            "title": title,
            "url": href,
            "snippet": snippet,
        }));
    }
    Ok(results)
}

/// Fetch a URL and return its text content with HTML stripped.
#[tauri::command]
pub fn web_fetch(url: String) -> Result<String, String> {
    let client = make_client()?;
    let body = client
        .get(&url)
        .send()
        .map_err(|e| e.to_string())?
        .text()
        .map_err(|e| e.to_string())?;

    let document = Html::parse_document(&body);

    // Remove script/style nodes by extracting only text from meaningful elements
    let body_sel = Selector::parse("body").unwrap();
    let _script_sel = Selector::parse("script, style, noscript, nav, footer, aside").unwrap();

    let text = if let Some(body_node) = document.select(&body_sel).next() {
        // Walk text nodes skipping script/style
        let full = body_node.text().collect::<Vec<_>>().join(" ");
        full
    } else {
        document.root_element().text().collect::<Vec<_>>().join(" ")
    };

    // Remove script/style content by re-parsing without those elements
    let clean_doc = Html::parse_document(&body);
    let mut clean_text = String::new();
    for node in clean_doc.select(&Selector::parse("p, h1, h2, h3, h4, h5, li, td, th, pre, code, blockquote, article, section, main").unwrap()) {
        // Skip if inside script/style
        let t = node.text().collect::<String>();
        let trimmed = t.trim();
        if !trimmed.is_empty() {
            clean_text.push_str(trimmed);
            clean_text.push('\n');
        }
    }

    let result = if clean_text.trim().is_empty() { text } else { clean_text };

    // Trim to ~8000 chars to avoid overwhelming context
    let truncated: String = result.chars().take(8000).collect();
    Ok(truncated)
}
