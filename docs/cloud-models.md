# Ollama Cloud Model Support

## Overview

Ollama Cloud (https://ollama.com) exposes the same REST API as local Ollama — identical endpoints (`/api/tags`, `/api/show`, `/api/chat`), just a different base URL and an `Authorization: Bearer {key}` header. Local Assistant routes chat through the cloud endpoint automatically when a cloud model is the active selection.

## Config

Add `ollama_cloud_api_key` to `~/.local-assistant/config.json`:

```json
{
  "brave_search_api_key": "...",
  "ollama_cloud_api_key": "sk-...",
  "mcp_servers": [...]
}
```

Get your key at https://ollama.com/settings/keys.

## Wire Format

| Property | Value |
|----------|-------|
| Base URL | `https://ollama.com` |
| Auth header | `Authorization: Bearer {key}` |
| List models | `GET /api/tags` |
| Capabilities | `POST /api/show { name }` |
| Chat | `POST /api/chat` |

All responses are identical in shape to the local Ollama API.

## UI

- **Cloud Models section** in the sidebar (below "Installed") — appears when `ollama_cloud_api_key` is set in config.json.
- Cloud models show a **CLOUD badge** (orange accent) to distinguish them from local models.
- Vision-capable cloud models also show the **VISION badge** (same gray style as local models).
- Selecting a cloud model routes all chat requests through `https://ollama.com/api/chat` with the auth header automatically.
- No download/pull or delete actions — cloud models are accessed directly.

## Data Flow

1. `useCloudConfig()` reads `~/.local-assistant/config.json` via Tauri `read_file` command, extracts `ollama_cloud_api_key`.
2. `useCloudModels(apiKey)` fetches `GET https://ollama.com/api/tags` — returns same `OllamaModel[]` shape.
3. `useCloudModelCapabilities(model, apiKey)` fetches `POST https://ollama.com/api/show` — detects `"vision"` capability.
4. In `useChat`, when the active model is found in the cloud list, `chatStream()` is called with `opts = { baseUrl: CLOUD_BASE, headers: { Authorization: "Bearer ..." } }`.
5. `chatStream()` merges opts into the fetch — no other code path changes.

## What Does NOT Change

- `OllamaModel` type — same for cloud and local
- `activeModel` in modelStore — just a string name; routing is derived dynamically
- Local model list, pull, delete — unaffected
- MCP, skills, vision input — unaffected
- Rust backend — zero changes; config read entirely in TypeScript
