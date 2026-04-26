# Local AI Assistant — Architecture & Build Plan

> Report 01 · Created 2026-04-26

## Overview

A standalone Mac desktop AI assistant that runs entirely locally. It uses Ollama to manage and serve local LLMs, supports Agent Skills (agentskills.io spec) for extending LLM capabilities, and provides a clean chat UI with streaming responses, color-coded output, and prompt history.

---

## Environment

| Component | Status |
|---|---|
| macOS | Darwin 25.4.0 |
| Node.js | v25.8.2 |
| npm | 11.13.0 |
| Xcode / Swift | 26.4 / 6.3 |
| Ollama | 0.18.2 (installed) |
| Rust | Installed at build time via rustup |

Ollama is already present on this machine. The app will handle cases where Ollama is present but not running (auto-start), and cases where it is absent (guided install).

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| App framework | **Tauri v2** | Native Mac .app / DMG bundle |
| Frontend | **React 19 + TypeScript** | Via Vite |
| Styling | **Tailwind CSS v4** | CSS-first config |
| State | **Zustand v5** | 3 stores: chat, model, skill |
| Data fetching | **TanStack Query v5** | Ollama API queries |
| Markdown | **react-markdown v10** | |
| YAML parsing | **js-yaml v4** | SKILL.md frontmatter |
| Icons | **lucide-react** | |
| Tauri plugins | fs, shell, dialog, store | Bundled with Tauri v2 |

---

## Self-Install / Auto-Start Logic

On every launch the app runs this check sequence:

```
1. Check if `ollama` binary exists in PATH / known locations
   → Not found → Show "Install Ollama" onboarding screen
      → Button: "Install via Homebrew" → invoke shell: brew install ollama
      → Button: "Download manually" → open https://ollama.com/download in browser
   → Found → continue

2. Check if Ollama daemon is responding: GET http://localhost:11434/api/version
   → Timeout / connection refused → invoke shell: ollama serve (background)
   → Wait up to 5s, retry → show spinner "Starting Ollama…"
   → Success → show green dot in sidebar
   → Still failing after 5s → show warning banner with "Retry" button

3. Check if any model is installed: GET /api/tags
   → Empty → Show "Pull your first model" prompt in chat area
   → Populated → load chat UI normally
```

This logic lives in `src/hooks/useOllamaHealth.ts` and runs on app mount.

---

## Project Structure

```
local-assistant/
├── docs/                             # Project documentation
│   └── 01-architecture-plan.md      # This file
├── skills/                           # Bundled skills (copied to ~/.local-assistant on first launch)
│   └── skill-creator/
│       └── SKILL.md
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css                     # Tailwind v4 theme
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          # Two-column layout: Sidebar + main
│   │   │   └── Sidebar.tsx           # Model selector, skill toggles, Ollama status
│   │   ├── chat/
│   │   │   ├── ChatView.tsx          # Scrollable message list + InputBar
│   │   │   ├── MessageList.tsx
│   │   │   ├── ResponseGroup.tsx     # Collapsible per-turn container
│   │   │   ├── MessageSegment.tsx    # final (white) / thinking (gray) / quoted (yellow)
│   │   │   ├── MarkdownRenderer.tsx
│   │   │   └── InputBar.tsx          # Textarea + UP/DOWN prompt history
│   │   ├── models/
│   │   │   ├── ModelManager.tsx      # Modal: list + pull + delete
│   │   │   └── ModelPullForm.tsx     # Pull by name, streaming progress
│   │   ├── skills/
│   │   │   └── SkillPanel.tsx        # List skills, toggle active
│   │   └── onboarding/
│   │       └── OllamaSetup.tsx       # Shown when Ollama not found / not running
├── src/
│   ├── hooks/
│   │   ├── useChat.ts                # Send, stream, turn management
│   │   ├── usePromptHistory.ts       # Ring buffer, UP/DOWN cycling
│   │   ├── useModels.ts              # TanStack Query for Ollama model CRUD
│   │   ├── useSkills.ts              # Load, activate, deactivate skills
│   │   └── useOllamaHealth.ts        # Auto-detect, auto-start, health poll
│   ├── stores/
│   │   ├── chatStore.ts              # turns[], streaming, appendToSegment
│   │   ├── modelStore.ts             # activeModel (persisted via plugin-store)
│   │   └── skillStore.ts             # available[], active Map<id, Skill>
│   ├── services/
│   │   ├── ollama.ts                 # All Ollama REST calls + stream readers
│   │   └── streamParser.ts           # NDJSON → {kind: thinking|final|done, delta}
│   ├── types/
│   │   ├── ollama.ts
│   │   ├── skill.ts
│   │   └── chat.ts                   # Turn, MessageSegment, SegmentKind
│   └── utils/
│       ├── responseParser.ts         # Post-stream: split "> " lines into quoted segments
│       └── skillLoader.ts            # js-yaml parse SKILL.md → Skill object
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── lib.rs                    # Plugin registration, setup hook
        ├── main.rs
        └── commands/
            ├── skills.rs             # list_skills, read_skill_file
            ├── fs_ops.rs             # read_file, write_file, list_dir
            └── ollama_check.rs       # check_ollama_installed, start_ollama_server
```

---

## Ollama API Reference

All calls made directly from the React frontend via `fetch()` to `http://localhost:11434`.

| Operation | Method | Endpoint |
|---|---|---|
| Health / version | GET | `/api/version` |
| List installed models | GET | `/api/tags` |
| Chat (streaming) | POST | `/api/chat` — `{model, messages, stream: true}` |
| Pull model | POST | `/api/pull` — `{name, stream: true}` |
| Delete model | DELETE | `/api/delete` — `{name}` |
| Show model info | POST | `/api/show` — `{name}` |

---

## Response Streaming & Parsing

Each NDJSON line from `/api/chat`:

```json
{ "message": { "role": "assistant", "content": "", "thinking": "..." }, "done": false }
```

- `message.thinking` present → `kind: "thinking"` segment (gray, collapsed by default)
- `message.content` present → `kind: "final"` segment (white, full markdown)
- `done: true` → stream complete

After stream ends, final segments are scanned for markdown blockquotes (`> ` prefix) and split into `kind: "quoted"` segments (yellow with left border).

---

## Agent Skills

### Format (agentskills.io spec)
```
skill-name/
└── SKILL.md   ← YAML frontmatter + markdown body
```

```markdown
---
name: skill-creator
description: Creates new agent skills from a description
allowed-tools: [write_file]
---
## Instructions ...
```

### Loading (progressive disclosure)
1. **App start**: Rust `list_skills` command walks `~/.local-assistant/skills/`, reads only YAML frontmatter → returns `{id, name, description, path}[]` (~100 tokens)
2. **User activates skill**: Rust `read_skill_file` returns full SKILL.md (<5000 tokens) → parsed by `skillLoader.ts`
3. **Before each chat**: `buildSystemPrompt()` assembles active skill bodies into the system message

### Bundled skill-creator
Copied from bundled `resources/skills/skill-creator/` to `~/.local-assistant/skills/skill-creator/` on first launch via Rust `setup` hook.

---

## Color Coding

| Segment | Color | Style |
|---|---|---|
| `final` | White | Full markdown rendering |
| `thinking` | Gray (`text-gray-400`) | Italic monospace, collapsed with "Reasoning" toggle |
| `quoted` | Yellow (`text-yellow-300`) | Left border `border-yellow-500` |

---

## Build Commands

```bash
# Development
npm run tauri dev

# Production (universal binary: Intel + Apple Silicon)
npm run tauri build -- --target universal-apple-darwin

# Output
# .app → src-tauri/target/universal-apple-darwin/release/bundle/macos/
# .dmg → src-tauri/target/universal-apple-darwin/release/bundle/dmg/
```

---

## Implementation Order

1. Project scaffold (Tauri + React/TS + Tailwind)
2. Ollama service layer + health check hook
3. Onboarding screen (OllamaSetup)
4. Basic chat + chatStore + InputBar
5. Streaming + streamParser + live segment updates
6. Response rendering (ResponseGroup, MessageSegment, colors)
7. Prompt history (usePromptHistory, UP/DOWN keys)
8. Model management panel
9. Skill loading (Rust commands + skillStore)
10. Skill system prompt injection
11. File operations (Rust commands)
12. Persistence (plugin-store for active model)
13. Bundle skill-creator + first-launch copy
14. Package (.app, DMG)
