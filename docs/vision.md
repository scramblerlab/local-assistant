# Vision / Image Input

## Overview

Vision-capable models in Ollama (LLaVA, Llama 3.2 Vision, Gemma 3, etc.) accept base64-encoded images alongside text in the `/api/chat` payload. This document describes how Local Assistant detects and surfaces that capability.

## Detection

`POST /api/show { "name": "<model>" }` returns a `capabilities` array. Vision models include `"vision"` in this list. The response is cached per model for the session lifetime (stale time: Infinity in TanStack Query).

```
GET /api/show { "name": "llava" }
→ { "capabilities": ["completion", "vision"], ... }
```

`getModelCapabilities(name)` in `src/services/ollama.ts` wraps this call. `useModelCapabilities(model)` in `src/hooks/useModels.ts` exposes `{ supportsVision: boolean }` to components.

## Wire Format

Images are raw base64 strings (no `data:...;base64,` prefix) attached to the user message:

```json
{
  "model": "llava",
  "messages": [
    { "role": "user", "content": "What's in this image?", "images": ["iVBORw0KGgo..."] }
  ]
}
```

Images only attach to the initial user message. Tool-result follow-up messages are text only.

## UI

- **Models sidebar** — vision models show a small `VISION` badge next to the model name.
- **InputBar** — when the active model supports vision, a paperclip icon appears. Clicking it opens a file picker (`image/*`, multiple). Pasting an image from the clipboard also works (the textarea's `onPaste` handler detects `image/*` clipboard items).
- **Thumbnail strip** — attached images appear above the textarea as small previews with an ✕ button to remove each one. Cleared automatically after send.
- **User bubble** — if a turn has attached images, they render as a horizontal thumbnail strip above the message text.

## Data Flow

1. User attaches image(s) in `InputBar` → base64 strings collected in local state.
2. On submit: `onSend(text, images)` → `useChat.sendMessage(text, images)`.
3. `sendMessage` calls `addTurn(text, model, images)` (stored in `Turn.images` for history rendering).
4. The last user `ChatMessage` in the built message array gets `images` injected before streaming starts.
5. `chatStream()` serializes the `images` field with the message — Ollama handles the rest.
6. Session save/load persists `Turn.images` as base64 strings in the session JSON automatically.

## What Doesn't Change

- `chatStream()` already passes messages as-is; `images` in `ChatMessage` just works.
- `useContextManager` / `buildMessages` — no changes; images injected after the array is built.
- MCP, skills, web search — unaffected.
