use std::collections::HashMap;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use serde_json::{json, Value};

pub struct McpManager(pub Mutex<HashMap<String, McpHandle>>);

pub struct McpHandle {
    _child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
    pub tools: Vec<Value>,
}

fn read_mcp_configs() -> Vec<(String, String, Vec<String>)> {
    let path = match dirs_next::home_dir() {
        Some(h) => h.join(".local-assistant").join("config.json"),
        None => return vec![],
    };
    let raw = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let json: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let servers = match json.get("mcp_servers").and_then(|v| v.as_array()) {
        Some(s) => s.clone(),
        None => return vec![],
    };
    servers.iter().filter_map(|s| {
        let id = s.get("id")?.as_str()?.to_string();
        let command = s.get("command")?.as_str()?.to_string();
        let args: Vec<String> = s.get("args")
            .and_then(|a| a.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        Some((id, command, args))
    }).collect()
}

fn send_request(handle: &mut McpHandle, method: &str, params: Value) -> Result<Value, String> {
    let id = handle.next_id;
    handle.next_id += 1;
    let req = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
    let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    writeln!(handle.stdin, "{}", line).map_err(|e| e.to_string())?;
    handle.stdin.flush().map_err(|e| e.to_string())?;

    // Read lines until we find the matching response (skip notifications)
    loop {
        let mut buf = String::new();
        let n = handle.stdout.read_line(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { return Err("MCP server closed stdout".to_string()); }
        let trimmed = buf.trim();
        if trimmed.is_empty() { continue; }
        let resp: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue, // skip non-JSON lines
        };
        if resp.get("id").is_none() { continue; } // notification — skip
        if resp.get("id") != Some(&json!(id)) { continue; } // wrong id
        if let Some(err) = resp.get("error") {
            return Err(format!("MCP error: {err}"));
        }
        return resp.get("result").cloned().ok_or_else(|| "no result field".to_string());
    }
}

fn send_notification(handle: &mut McpHandle, method: &str, params: Value) -> Result<(), String> {
    let notif = json!({ "jsonrpc": "2.0", "method": method, "params": params });
    let line = serde_json::to_string(&notif).map_err(|e| e.to_string())?;
    writeln!(handle.stdin, "{}", line).map_err(|e| e.to_string())?;
    handle.stdin.flush().map_err(|e| e.to_string())
}

fn start_server(id: &str, command: &str, args: &[String]) -> Result<McpHandle, String> {
    // Augment PATH so npx/node are reachable even when launched as a .app bundle
    let existing_path = std::env::var("PATH").unwrap_or_default();
    let augmented_path = format!(
        "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}",
        existing_path
    );

    let mut child = Command::new(command)
        .args(args)
        .env("PATH", augmented_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("[mcp/{id}] spawn failed: {e}"))?;

    let stdin = child.stdin.take().ok_or_else(|| format!("[mcp/{id}] no stdin"))?;
    let stdout = child.stdout.take().ok_or_else(|| format!("[mcp/{id}] no stdout"))?;

    let mut handle = McpHandle {
        _child: child,
        stdin: BufWriter::new(stdin),
        stdout: BufReader::new(stdout),
        next_id: 1,
        tools: vec![],
    };

    // MCP handshake
    send_request(&mut handle, "initialize", json!({
        "protocolVersion": "2025-11-25",
        "capabilities": {},
        "clientInfo": { "name": "local-assistant", "version": "0.1.0" }
    }))?;
    send_notification(&mut handle, "notifications/initialized", json!({}))?;

    // Discover tools
    let result = send_request(&mut handle, "tools/list", json!({}))?;
    handle.tools = result
        .get("tools")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();

    eprintln!("[mcp/{id}] started, {} tools loaded", handle.tools.len());
    Ok(handle)
}

fn start_all_inner(handles: &mut std::collections::HashMap<String, McpHandle>) -> Vec<Value> {
    let configs = read_mcp_configs();
    let mut summaries = Vec::new();
    for (id, command, args) in configs {
        if handles.contains_key(&id) {
            let tools = handles[&id].tools.clone();
            summaries.push(json!({ "id": id, "tools": tools }));
            continue;
        }
        match start_server(&id, &command, &args) {
            Ok(handle) => {
                let tools = handle.tools.clone();
                summaries.push(json!({ "id": id, "tools": tools }));
                handles.insert(id, handle);
            }
            Err(e) => eprintln!("[mcp/{id}] failed to start: {e}"),
        }
    }
    summaries
}

#[tauri::command]
pub fn mcp_start_all(state: tauri::State<'_, McpManager>) -> Result<Vec<Value>, String> {
    let mut handles = state.0.lock().map_err(|e| e.to_string())?;
    Ok(start_all_inner(&mut handles))
}

#[tauri::command]
pub fn mcp_reload_all(state: tauri::State<'_, McpManager>) -> Result<Vec<Value>, String> {
    let mut handles = state.0.lock().map_err(|e| e.to_string())?;
    handles.clear(); // drops all McpHandles, closing their stdin pipes → child exits
    Ok(start_all_inner(&mut handles))
}

#[tauri::command]
pub fn mcp_call_tool(
    server_id: String,
    tool_name: String,
    args: Value,
    state: tauri::State<'_, McpManager>,
) -> Result<String, String> {
    let mut handles = state.0.lock().map_err(|e| e.to_string())?;
    let handle = handles
        .get_mut(&server_id)
        .ok_or_else(|| format!("MCP server '{server_id}' not running"))?;

    let result = send_request(handle, "tools/call", json!({
        "name": tool_name,
        "arguments": args,
    }))?;

    let is_error = result.get("isError").and_then(|v| v.as_bool()).unwrap_or(false);
    let content = result
        .get("content")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    if is_error { Err(content) } else { Ok(content) }
}
