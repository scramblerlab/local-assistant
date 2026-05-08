# File & Directory Permission System — Implementation Plan

## Context

The app's AI models can already call `read_file`, `write_file`, and `list_dir` via tool tags with no restrictions. This adds a permission layer: a shared, persistent list of approved folders that gates all file/directory operations, with a real-time dialog for new-folder requests.

---

## Architecture Overview

Three layers:
1. **Rust backend** — permission storage/optimization (`permissions.rs`) + new file ops with built-in verification (`fs_ops.rs`)
2. **Frontend interceptor** — permission check + Promise-based dialog before any file tool call (`useChat.ts`, `permissionStore.ts`, `FilePermissionDialog.tsx`)
3. **System prompt injection** — AI is told its current approved folders and the new tool API

---

## Files to Create

### `src-tauri/src/commands/permissions.rs`

New module. Reads/writes `~/.local-assistant/file_permissions.json`:

```json
{ "approved_folders": ["/Users/nobu/Documents", "/Users/nobu/projects"] }
```

Paths stored as canonical absolute strings (no `~`). Uses `resolve_path()` from `fs_ops.rs` for consistent tilde expansion.

Key private helpers:
- `permissions_path(app)` — returns `app_data_dir(app).join("file_permissions.json")`
- `load_store(app) -> PermissionStore` — deserialize; return empty on missing/error
- `save_store(store, app)` — serialize with `serde_json::to_string_pretty`
- `resolve_to_canonical(path_str, app) -> Option<PathBuf>` — calls `resolve_path()`, then `canonicalize()` with fallback
- `optimize_folder_list(existing: Vec<String>, new_folder: &str) -> Option<Vec<String>>`:
  - Returns `None` if `new_folder` is already covered by an entry in `existing` (skip add)
  - Otherwise: removes any existing entries that are sub-paths of `new_folder`, then appends it

Commands to expose:
```rust
get_file_permissions(app) -> Vec<String>
add_file_permission(path: String, app) -> Result<Vec<String>, String>  // add + optimize + save; returns updated list
remove_file_permission(path: String, app) -> Result<Vec<String>, String>
check_file_permission(path: String, app) -> bool  // prefix match against approved list
get_home_dir() -> String  // dirs_next::home_dir() — used by frontend to classify paths
```

---

### `src/stores/permissionStore.ts`

Zustand store (no `persist` — source of truth is the JSON file). No localStorage.

State shape:
```typescript
{
  approvedFolders: string[];  // canonical absolute paths
  homeDir: string;            // populated during initialize()
  pending: PendingPermission | null;  // drives the dialog
}

interface PendingPermission {
  path: string;
  folder: string;        // parent directory of path
  operation: string;     // human-readable label
  isOutsideHome: boolean;
  resolve: (granted: boolean) => void;
}
```

Key actions:
- `initialize()` — invokes `get_file_permissions` and `get_home_dir`; stores both. Called once at app startup.
- `isApproved(path: string) -> boolean` — in-memory prefix match; zero IPC latency on happy path
- `requestPermission(path, operation) -> Promise<boolean>` — sets `pending` with a Promise resolver; the dialog calls `grantPermission()` or `denyPermission()` to resolve it
- `grantPermission()` — if NOT outside home: invokes `add_file_permission`, updates `approvedFolders` from returned list, clears `pending`, resolves `true`; if outside home: just resolves `true` without invoking (never saved to list)
- `denyPermission()` — clears `pending`, resolves `false`

---

### `src/components/permissions/FilePermissionDialog.tsx`

Reads `pending` from `permissionStore`. Renders `null` when `pending === null` (always mounted, zero cost when idle).

Two-confirmation flow for outside-home paths via local `useState(step: 0 | 1)`:
- Step 0: red warning banner + "Allow" button → increments step to 1
- Step 1: stronger warning ("will NOT be saved to permission list") + "I understand, allow once" → calls `grantPermission()`

Normal flow (inside home): single dialog, "Allow" calls `grantPermission()` directly.

Shows: operation label, full path in monospace, note that all subfolders will also be approved (if inside home).

Uses `position: fixed` overlay; inline styles matching existing app CSS variables (`--color-surface`, `--color-accent`, `--color-border-2`, `--color-red`, etc.).

---

## Files to Modify

### `src-tauri/src/commands/fs_ops.rs`

1. **Add write verification to `write_file`** — after `std::fs::write`, re-read with `std::fs::read_to_string` and compare. If mismatch: return `Err("write_file verification failed: content mismatch for {path}")`.

2. **Add `get_home_dir`**:
   ```rust
   #[tauri::command]
   pub async fn get_home_dir() -> String {
       dirs_next::home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default()
   }
   ```

3. **Add `create_dir`** — `fs::create_dir_all`; verify with `p.is_dir()` check after; error: `"create_dir verification failed: {path} does not exist after mkdir"`.

4. **Add `rename_path(from, to)`** — `fs::rename`; verify `to.exists() && !from.exists()`; error messages for each case.

5. **Add `delete_path`** — `remove_dir_all` or `remove_file` based on `p.is_dir()`; verify `!p.exists()`; error: `"delete_path verification failed: {path} still exists"`.

---

### `src-tauri/src/commands/mod.rs`

Add: `pub mod permissions;`

---

### `src-tauri/src/lib.rs`

Add to imports: `use commands::{..., permissions};`

Add to `generate_handler!`:
```rust
fs_ops::create_dir,
fs_ops::rename_path,
fs_ops::delete_path,
fs_ops::get_home_dir,
permissions::get_file_permissions,
permissions::add_file_permission,
permissions::remove_file_permission,
permissions::check_file_permission,
```

---

### `src/App.tsx`

Add to `useEffect` in `AppInner`:
```typescript
usePermissionStore.getState().initialize();
```
(alongside existing `initSessions()` call)

---

### `src/components/layout/AppShell.tsx`

Add `<FilePermissionDialog />` as the last child of the outer `div` (it uses `position: fixed`, so it doesn't affect flex layout):

```tsx
import { FilePermissionDialog } from "../permissions/FilePermissionDialog";
// ...
return (
  <div style={{ display: "flex", height: "100%", background: "var(--color-bg)" }}>
    {/* ...existing sidebar, drag handle, main... */}
    <FilePermissionDialog />
  </div>
);
```

---

### `src/hooks/useChat.ts`

**1. Add path classification helpers** (module-level, near `isPlaceholderArg`):

```typescript
const APP_INTERNAL_PREFIX = "~/.local-assistant";
const FILE_OP_TOOLS = new Set(["read_file","write_file","list_dir","create_dir","rename_path","delete_path"]);

function classifyPath(path: string, homeDir: string): "internal" | "home" | "outside-home" {
  if (path.startsWith(APP_INTERNAL_PREFIX)) return "internal";
  if (path.startsWith("~/") || path === "~") return "home";
  if (homeDir && path.startsWith(homeDir)) return "home";
  return "outside-home";
}

function operationLabel(name: string, args: Record<string, string>): string { /* per-tool human labels */ }
```

**2. Add `checkPermissionForOp`** (module-level async function, reads from `permissionStore.getState()`):

- Collects all paths from args (handles `rename_path` having both `from` + `to`)
- Skips "internal" paths (no dialog, always allowed)
- For "home" paths: calls `isApproved(path)` — if true, skips (zero latency)
- Otherwise: calls `requestPermission(path, operationLabel(...))` — awaits dialog resolution
- Returns `false` immediately if any path is denied

**3. Modify `executeTool`** — add permission gate as first block:

```typescript
async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  if (FILE_OP_TOOLS.has(name)) {
    const allowed = await checkPermissionForOp(name, args);
    if (!allowed) return "Permission denied: the user did not grant access to the requested path.";
  }
  // ...existing dispatch unchanged, plus new cases:
  if (name === "create_dir") { await invoke("create_dir", { path: args.path ?? "" }); return `Directory created: ${args.path}`; }
  if (name === "rename_path") { await invoke("rename_path", { from: args.from ?? "", to: args.to ?? "" }); return `Renamed ${args.from} → ${args.to}`; }
  if (name === "delete_path") { await invoke("delete_path", { path: args.path ?? "" }); return `Deleted: ${args.path}`; }
}
```

**4. Add `buildFilePermissionsSection(approvedFolders: string[])`** (alongside `buildMcpSection`):

Emits a system prompt block that:
- Lists currently approved folders (or "(none yet)" if empty)
- Documents `create_dir`, `rename_path`, `delete_path` tool syntax
- States that permission dialogs appear automatically; AI doesn't need to ask in chat
- States all write/create/rename/delete ops are verified; AI will receive an error if verification fails
- States `~/.local-assistant/` is always accessible

**5. Extend `buildSystemPrompt`** — add `approvedFolders: string[]` parameter; append `buildFilePermissionsSection(approvedFolders)`.

**6. Update call site** (line 278):
```typescript
const systemPrompt = buildSystemPrompt(
  availableSkills, activeSkills, useMcpStore.getState().servers,
  usePermissionStore.getState().approvedFolders,
);
```

---

## Verification Strategy (built into Rust commands)

| Operation | Verification | Error prefix |
|---|---|---|
| `write_file` | Re-read file; compare to written content | `write_file verification failed:` |
| `create_dir` | `p.is_dir()` after mkdir | `create_dir verification failed:` |
| `rename_path` | `to.exists() && !from.exists()` | `rename verification failed:` |
| `delete_path` | `!p.exists()` | `delete_path verification failed:` |
| `read_file` / `list_dir` | OS error is sufficient | N/A |

AI receives the error string as the tool result and can report it to the user.

---

## End-to-End Test Scenarios

1. **Pre-approved folder** — approve `~/Documents` once; subsequent ops on any path under it skip the dialog
2. **First access dialog** — fresh state; AI tries to read `~/Desktop/file.txt`; dialog shows; approve; file read succeeds; `file_permissions.json` updated
3. **Optimization** — approve `~/Documents/sub`; then approve `~/Documents`; JSON should contain only `~/Documents`
4. **Already covered** — approve `~/projects`; AI accesses `~/projects/foo/bar.ts`; no dialog, JSON unchanged
5. **Outside-home two confirmations** — AI targets `/etc/hosts`; first dialog appears; click Allow; second dialog with stronger warning; click "I understand"; op proceeds; `file_permissions.json` NOT updated; next request for `/etc/hosts` shows dialog again
6. **User denies** — AI gets `"Permission denied: ..."` as tool result; handles gracefully in chat
7. **Write verification** — `write_file` returns success only when re-read content matches
8. **Delete verification** — path gone after delete; `delete_path` returns success
9. **Internal path bypass** — AI writes to `~/.local-assistant/config.json`; no dialog
10. **System prompt accuracy** — approved folders appear verbatim in system prompt on next message turn
