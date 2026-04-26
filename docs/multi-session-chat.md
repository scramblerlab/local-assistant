# Multi-Session Chat — Implementation Plan

## Context

The app currently stores one flat chat history in `~/.local-assistant/history.json`. This adds multi-session support: a "+" button to open a fresh chat session, and a "History" button to browse and restore any of the last 10 sessions. Each session has its own isolated context (turns + compactSummary); switching sessions replaces the active chat with the selected one.

---

## Data Model

### New types (`src/types/session.ts`)
```typescript
export interface SessionMeta {
  id: string;
  title: string;       // first user message, truncated to 60 chars
  createdAt: number;
  updatedAt: number;
  turnCount: number;
}

export interface Session extends SessionMeta {
  turns: Turn[];
  compactSummary: string | null;
}
```

---

## Storage Layout

```
~/.local-assistant/
  sessions/
    index.json          ← SessionMeta[], sorted by updatedAt desc, max 10
    {uuid}.json         ← full Session (turns + compactSummary)
  history.json          ← OLD file, migrated on first boot then ignored
```

---

## New Service (`src/services/sessions.ts`)

| Function | What it does |
|---|---|
| `initSessions()` | Boot: migrate old `history.json` → first session if `sessions/index.json` absent; create empty session if nothing exists. Returns the active `Session`. |
| `listSessions()` | Read `sessions/index.json`, return `SessionMeta[]` (last 10, newest first). |
| `loadSession(id)` | Read `sessions/{id}.json`, return full `Session`. |
| `saveSession(session)` | Write `sessions/{id}.json`; upsert entry in index; drop entries beyond 10. |
| `createSession()` | Generate new empty session (new UUID, empty turns), save to disk, return it. |

Title is auto-set from the first `userMessage` of the session (≤ 60 chars), updated on `saveSession` when current title is the placeholder "New chat".

---

## chatStore Changes (`src/stores/chatStore.ts`)

Add two fields and one action:
```typescript
currentSessionId: string;
setCurrentSession: (id: string, turns: Turn[], compactSummary: string | null) => void;
```
`setCurrentSession` atomically replaces `currentSessionId`, `turns`, and `compactSummary`.

---

## useChat Changes (`src/hooks/useChat.ts`)

Replace the call to `saveHistory(turns, compactSummary)` with `saveSession(...)`.

---

## App Bootstrap (`src/App.tsx`)

Replace `loadHistory()` with `initSessions()`:
```typescript
useEffect(() => {
  initSessions().then((session) => {
    store.setCurrentSession(session.id, session.turns, session.compactSummary);
  });
}, []);
```

---

## New UI Component: `ChatHeader` (`src/components/chat/ChatHeader.tsx`)

Slim bar (36px) at top of ChatView, aligned right:
```
                              [History]  [+ New Chat]
```

History panel: absolute-positioned dropdown, ~260px wide, right-aligned. Each row shows session title + relative timestamp. Clicking loads that session. Closes on outside click or selection.

---

## Critical Files

| File | Change |
|---|---|
| `src/types/session.ts` | **New** |
| `src/services/sessions.ts` | **New** |
| `src/components/chat/ChatHeader.tsx` | **New** |
| `src/stores/chatStore.ts` | Add `currentSessionId`, `setCurrentSession` |
| `src/hooks/useChat.ts` | Replace `saveHistory` with `saveSession` |
| `src/App.tsx` | Replace `loadHistory` with `initSessions` |
| `src/components/chat/ChatView.tsx` | Add `ChatHeader`, wire session callbacks |

`src/services/history.ts` — kept only for migration in `initSessions`.

---

## Verification

1. Click "+": chat clears. Send a message. Click "History" — new session appears with title from that message.
2. Click an older session in History: old turns load; active session highlighted.
3. Two sessions with different topics retain independent contexts.
4. Delete `sessions/`, keep old `history.json`, restart — old history migrates to first session.
5. Create 11+ sessions; only latest 10 appear in History.
