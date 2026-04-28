# Local Assistant

A standalone Mac desktop AI assistant built on [Ollama](https://ollama.com). Run models locally for full privacy, or connect to Ollama Cloud for access to hosted models — your choice.

## Features

- **Local LLMs** — chat with any model installed in Ollama (Qwen, Llama, Mistral, Gemma, and more)
- **Ollama Cloud models** — browse and use cloud-hosted models without downloading them locally (requires an Ollama account; some models need a paid plan)
- **Vision support** — attach images via file picker or clipboard paste when using a vision-capable model (LLaVA, Llama 3.2 Vision, Gemma 3, etc.)
- **Web search** — choose between Ollama Web Search and Brave Search from the sidebar; the selected provider is used whenever the model calls the `web_search` tool
- **Web fetch** — the model can retrieve and read the content of any URL
- **Agent Skills** — extend the assistant with custom skill files; all installed skills are always active and injected into the system prompt automatically
- **MCP (Model Context Protocol)** — connect external tool servers; each server's tools are listed in the sidebar and made available to the model automatically
- **Streaming responses** — real-time output with color-coded segments: white (response), gray italic (reasoning/thinking, collapsible), yellow (quoted passages)
- **Model management** — pull, switch, and delete local models from within the app
- **Context management** — live context usage meter, `/compact` command to summarise older turns, and automatic compaction when the context window fills up
- **Prompt history** — cycle through past prompts with ↑/↓ arrow keys
- **Japanese / CJK IME support** — Enter confirms composition without submitting prematurely
- **Drag-resizable sidebar** — adjust the panel width to your liking
- **Conversation persistence** — sessions saved to `~/.local-assistant/sessions/` and restored on relaunch

## Requirements

- macOS 12 Monterey or later
- [Ollama](https://ollama.com) — the app will prompt you to install it if it isn't found

## Getting Started

### Development

```bash
# Install dependencies
pnpm install

# Run in dev mode (hot-reload)
pnpm tauri dev
```

> First run compiles the Rust backend (~2–3 min). Subsequent starts are fast.

### Production build

```bash
pnpm tauri build -- --target aarch64-apple-darwin
# Output: src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Local Assistant.app
```

> For a universal binary that runs on both Apple Silicon and Intel Macs, use `--target universal-apple-darwin` instead.

## Configuration

All optional features are configured in `~/.local-assistant/config.json`:

```json
{
  "ollama_cloud_api_key": "sk-...",
  "brave_search_api_key": "BSA...",
  "mcp_servers": [
    { "id": "my-server", "command": "npx", "args": ["-y", "@org/mcp-package@latest"] }
  ]
}
```

## Sidebar

The sidebar is organised alphabetically into five collapsible sections:

| Section | What it does |
|---|---|
| **MCP** | Lists connected MCP servers and their tools; reload button refreshes all servers |
| **Models** | Browse, pull, and select locally installed Ollama models |
| **Models:Cloud** | Browse and select cloud-hosted Ollama models (requires `ollama_cloud_api_key`) |
| **Skills** | Lists all installed skills — they are always active, no toggle needed |
| **Web Search** | Select a search provider (Ollama or Brave); grayed out if the matching key is missing |

## Web Search

The `web_search` tool requires a provider to be selected in the **Web Search** sidebar section. Two providers are supported:

| Provider | Config key | Notes |
|---|---|---|
| Ollama Web Search | `ollama_cloud_api_key` | Same key as cloud models — no extra signup |
| Brave Search | `brave_search_api_key` | Free tier: 2,000 queries/month |

On startup the app auto-selects a provider if a key is available (Ollama takes priority when both keys are present). You can switch or deselect at any time from the sidebar.

When no provider is selected, calling `web_search` returns an error message in the chat explaining that a provider needs to be configured.

**Get keys:**
- Ollama: [ollama.com/settings/keys](https://ollama.com/settings/keys)
- Brave: [brave.com/search/api](https://brave.com/search/api/)

## Ollama Cloud Models

The **Models:Cloud** section in the sidebar lists all cloud-hosted models available on your Ollama account. Select one to use it as your active model — chat is proxied through the Ollama Cloud API automatically (no CORS issues).

Models that support vision are automatically detected and shown with a **VISION** badge. Use the filter field to search by name.

### Setup

1. Sign up at [ollama.com](https://ollama.com) and generate an API key at **Settings → Keys**.
2. Add the key to `~/.local-assistant/config.json`:

```json
{
  "ollama_cloud_api_key": "sk-..."
}
```

3. Open the **Models:Cloud** section in the sidebar to browse and select a model.

Some cloud models require a paid [Ollama subscription](https://ollama.com/pricing). If a model returns a `403` error, you'll see an explanation in the chat. For the full API reference see the [Ollama Cloud docs](https://docs.ollama.com/cloud).

## Agent Skills

Skills live in `~/.local-assistant/skills/`. Each skill is a folder with a `SKILL.md` file — YAML frontmatter followed by a markdown body that is injected verbatim into the system prompt.

```
~/.local-assistant/skills/
└── my-skill/
    └── SKILL.md
```

```markdown
---
name: My Skill
description: What this skill does
---

Your instructions here.
```

All installed skills are always active — there is no per-session toggle. The **Skills** sidebar section lists what is currently loaded.

The bundled `skill-creator` skill helps you author new skills directly from the chat interface.

## MCP Servers

MCP servers extend the model with external tools (file systems, APIs, databases, etc.). Configure them in `~/.local-assistant/config.json`:

```json
{
  "mcp_servers": [
    { "id": "filesystem", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    { "id": "my-api",     "command": "node", "args": ["/path/to/server.js"] }
  ]
}
```

The **MCP** section in the sidebar lists each server's status and available tools. Use the reload button (↺) to restart all servers after a config change.

## Tech Stack

| Layer | Technology |
|---|---|
| App framework | Tauri v2 |
| Frontend | React 19 + TypeScript (Vite) |
| State | Zustand v5 |
| Data fetching | TanStack Query v5 |
| Markdown | react-markdown |
| Icons | lucide-react |
| LLM runtime | Ollama (local + cloud) |

## License

MIT — see [LICENSE](LICENSE) for details.
