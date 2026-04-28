# Web Search Provider Selector

## Overview

The Web Search section in the sidebar lets users choose which search backend the assistant uses when the LLM calls the `web_search` tool. Two providers are supported: **Ollama Web Search** and **Brave Search**. Each requires its own API key in `~/.local-assistant/config.json`. If no provider is selected, web search returns an error message in the chat prompting the user to configure one.

DDG/Bing scraping has been removed entirely.

## Providers

| Provider | Config key | API endpoint |
|----------|-----------|--------------|
| Ollama | `ollama_cloud_api_key` | `POST https://ollama.com/api/web_search` |
| Brave | `brave_search_api_key` | `GET https://api.search.brave.com/res/v1/web/search` |

### Ollama Web Search
- Same API key as cloud models
- Get a key at https://ollama.com/settings/keys
- Request: `{"query": "...", "max_results": 5}`
- Response: `{"results": [{"title", "url", "content"}]}`
- Docs: https://docs.ollama.com/capabilities/web-search

### Brave Search
- Free tier: 2,000 queries/month
- Get a key at https://brave.com/search/api/
- Returns up to 10 results with title, URL, and snippet

## Config

```json
{
  "ollama_cloud_api_key": "sk-...",
  "brave_search_api_key": "BSA..."
}
```

## UI Behaviour

- Each provider row is **enabled** (selectable) when its key is present in config.json.
- Each provider row is **grayed out** when the key is missing. Clicking it expands an inline hint with the config key name and a link to get a key.
- The **currently selected** row has the accent left border. Clicking it again deselects (sets provider to null).
- When no provider is selected, a note reads "No provider selected — web search will return an error".

## Data Flow

1. User selects a provider in the sidebar → stored in `searchStore` (localStorage-persisted).
2. LLM emits `<tool_call>{"name":"web_search","args":{"query":"..."}}`.
3. `executeTool` in `useChat.ts` reads the provider from the store.
4. If `provider === null`: returns an error string to the LLM as a tool result.
5. Otherwise: calls `webSearch(query, provider)` → `invoke("web_search", {query, provider})`.
6. Rust `web_search` command routes to the appropriate search function.

## What Does Not Change

- `web_fetch` — the Rust scraper is still used for fetching specific URLs.
- Tool call parsing, MCP, skills, vision, cloud models — unaffected.
