# Local Assistant

A standalone Mac desktop AI assistant built on [Ollama](https://ollama.com). Run models locally for full privacy, or connect to Ollama Cloud for access to hosted models — your choice.

## Features

- **Local LLMs** — chat with any model available in Ollama (Qwen, Llama, Mistral, Gemma, etc.)
- **Ollama Cloud models** — browse and use cloud-hosted models (requires an Ollama subscription; see [Pricing](https://ollama.com/pricing))
- **Vision support** — attach images via file picker or clipboard paste when using a vision-capable model (LLaVA, Llama 3.2 Vision, Gemma 3, etc.)
- **Streaming responses** — real-time output with color-coded segments:
  - White — final response
  - Gray italic — model reasoning / thinking (collapsible)
  - Yellow — quoted passages
- **Model management** — pull, switch, and delete models from within the app
- **MCP (Model Context Protocol)** — connect external tool servers; tools appear as pills in the sidebar and are available to the model automatically
- **Web search** — powered by Brave Search API (with DuckDuckGo/Bing fallback)
- **Agent Skills** — extend the assistant with custom skill definitions ([agentskills.io](https://agentskills.io) spec); includes a bundled `skill-creator` skill
- **Context management** — live context usage meter, `/compact` command to summarise older turns, and automatic compaction when the context window fills up
- **Prompt history** — cycle through past prompts with ↑/↓ arrow keys
- **Japanese / CJK IME support** — Enter confirms composition without submitting prematurely
- **Drag-resizable sidebar** — adjust the model/skill panel to your liking
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
pnpm tauri build -- --target universal-apple-darwin
# Output: src-tauri/target/universal-apple-darwin/release/bundle/macos/Local Assistant.app
```

## Configuration

All optional features are configured in `~/.local-assistant/config.json`:

```json
{
  "brave_search_api_key": "YOUR_BRAVE_KEY",
  "ollama_cloud_api_key": "YOUR_OLLAMA_CLOUD_KEY",
  "mcp_servers": [
    { "id": "my-server", "command": "npx", "args": ["-y", "@org/mcp-package@latest"] }
  ]
}
```

## Web Search

The assistant can search the web using the `web_search` tool. By default it falls back to scraping DuckDuckGo and Bing, but for reliable results configure a [Brave Search API](https://brave.com/search/api/) key (free tier: 2,000 queries/month).

Add `brave_search_api_key` to `~/.local-assistant/config.json` (see above). When the key is present, Brave Search is used first; the scraper fallbacks remain active if the key is missing or the request fails.

## Ollama Cloud Models

[Ollama Cloud](https://ollama.com) lets you use powerful hosted models (DeepSeek, Llama, Gemma, and more) without downloading them locally. The **Models:Cloud** section in the sidebar lists all available cloud models and lets you select one as your active model — chat is routed through the Ollama Cloud API automatically.

### Plans

Some Cloud model access requires a paid [Ollama subscription](https://ollama.com/pricing). A free account gives you API access to list models, but sending prompts returns a `403` until you upgrade.

### Setup

1. Sign up at [ollama.com](https://ollama.com) and generate an API key at **Settings → Keys**.
2. Add the key to `~/.local-assistant/config.json`:

```json
{
  "ollama_cloud_api_key": "sk-..."
}
```

3. The **Models:Cloud** section appears in the sidebar immediately. Click it to browse available models and select one to chat with.

Cloud models that support vision are automatically detected and show a **VISION** badge, just like local models.

For the full API reference see the [Ollama Cloud docs](https://docs.ollama.com/cloud).

## Agent Skills

Skills live in `~/.local-assistant/skills/`. Each skill is a folder containing a `SKILL.md` file with YAML frontmatter and a markdown body that is injected into the system prompt when the skill is active.

```
~/.local-assistant/skills/
└── my-skill/
    └── SKILL.md
```

The bundled `skill-creator` skill helps you write new skills directly from the chat interface.

## Tech Stack

| Layer | Technology |
|---|---|
| App framework | Tauri v2 |
| Frontend | React 19 + TypeScript (Vite) |
| State | Zustand v5 |
| Data fetching | TanStack Query v5 |
| Markdown | react-markdown |
| Icons | lucide-react |
| LLM runtime | Ollama |

## License

MIT — see [LICENSE](LICENSE) for details.
