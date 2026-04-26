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

/// Scrape Bing search results (primary — most permissive bot access).
fn search_bing(client: &reqwest::blocking::Client, query: &str) -> Vec<serde_json::Value> {
    let url = format!(
        "https://www.bing.com/search?q={}&setlang=ja",
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
    let algo_sel = match Selector::parse("#b_results li.b_algo") { Ok(s) => s, Err(_) => return vec![] };
    let title_sel = match Selector::parse("h2 a") { Ok(s) => s, Err(_) => return vec![] };
    let snip_sel = match Selector::parse(".b_caption p, .b_algoSlug") { Ok(s) => s, Err(_) => return vec![] };

    let mut results = Vec::new();
    for node in document.select(&algo_sel).take(5) {
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
    eprintln!("[web_search/bing] {} results", results.len());
    results
}

/// DuckDuckGo HTML via POST (required — GET is blocked as bot traffic).
fn search_ddg(client: &reqwest::blocking::Client, query: &str) -> Vec<serde_json::Value> {
    let form = format!("q={}&b=&kl=&df=", urlencoding::encode(query));
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

/// Search the web and return top 5 results.
#[tauri::command]
pub fn web_search(query: String) -> Result<Vec<serde_json::Value>, String> {
    let client = make_client()?;

    let results = search_ddg(&client, &query);
    if !results.is_empty() { return Ok(results); }

    let results = search_bing(&client, &query);
    if !results.is_empty() { return Ok(results); }

    eprintln!("[web_search] all strategies exhausted for query={:?}", query);
    Ok(vec![])
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
