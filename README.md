# Local Assistant

A standalone Mac desktop AI assistant that runs entirely locally using [Ollama](https://ollama.com). No cloud required — your conversations stay on your machine.

## Features

- **Local LLMs** — chat with any model available in Ollama (Qwen, Llama, Mistral, Gemma, etc.)
- **Streaming responses** — real-time output with color-coded segments:
  - White — final response
  - Gray italic — model reasoning / thinking (collapsible)
  - Yellow — quoted passages
- **Model management** — pull, switch, and delete models from within the app
- **Agent Skills** — extend the assistant with custom skill definitions ([agentskills.io](https://agentskills.io) spec); includes a bundled `skill-creator` skill
- **Context management** — live context usage meter, `/compact` command to summarise older turns, and automatic compaction when the context window fills up
- **Prompt history** — cycle through past prompts with ↑/↓ arrow keys
- **Japanese / CJK IME support** — Enter confirms composition without submitting prematurely
- **Drag-resizable sidebar** — adjust the model/skill panel to your liking
- **Conversation persistence** — history is saved to `~/.local-assistant/history.json` and restored on relaunch

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

## Web Search

The assistant can search the web using the `web_search` tool. By default it falls back to scraping DuckDuckGo and Bing, but for reliable results configure a [Brave Search API](https://brave.com/search/api/) key (free tier: 2,000 queries/month).

Create `~/.local-assistant/config.json`:

```json
{
  "brave_search_api_key": "YOUR_KEY_HERE"
}
```

When this key is present, Brave Search is used first. The scraper fallbacks remain active if the key is missing or the request fails.

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
