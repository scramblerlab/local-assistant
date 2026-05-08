# Settings Panel — Implementation Plan

## Context

API keys are currently read from `~/.local-assistant/config.json` via `invoke("read_file")`. This breaks on iOS/Android (no arbitrary file system). The new Settings panel stores keys in `@tauri-apps/plugin-store` (already installed), which uses UserDefaults on iOS, SharedPreferences on Android, and a JSON file on desktop. The Web Search panel currently shows a "add to config.json" hint when a provider has no key; that becomes a direct "Open Settings" action.

---

## Architecture

`settingsStore` (new) becomes the single source of truth for API keys. `useSearchConfig()` and `useCloudConfig()` become thin synchronous Zustand selectors — same return shape `{ data: ... }` so all existing call sites compile unchanged. No React Query for these two hooks anymore.

---

## Files to Create

### `src/stores/settingsStore.ts`

Uses `LazyStore` from `@tauri-apps/plugin-store` (synchronous construction, lazy init).

```typescript
import { LazyStore } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

const _store = new LazyStore("settings.json", { autoSave: false });
```

State: `ollamaApiKey: string`, `braveApiKey: string`, `initialized: boolean`

Key actions:
- `initialize()` — guard: `if (get().initialized) return`. Calls `await _store.init()`. Reads `"ollama_api_key"` and `"brave_api_key"`. If both `undefined` (first run), tries migrating from `config.json` via `invoke("read_file", { path: "~/.local-assistant/config.json" })`, extracts `ollama_cloud_api_key` + `brave_search_api_key`, writes to plugin-store and saves. Sets state + `initialized: true`.
- `setOllamaApiKey(key)` — `_store.set` → `_store.save()` → `set({ ollamaApiKey: trimmed })`
- `setBraveApiKey(key)` — same pattern

Migration check: `if (storedOllama !== undefined || storedBrave !== undefined)` use plugin-store values directly (skips config.json read).

### `src/components/settings/SettingsPanel.tsx`

Two `ApiKeyRow` sub-components (internal, not exported). Each row has:
- Label + "Get a key" external link (one line, `justifyContent: space-between`)
- `type="password"` input + Eye/EyeOff icon toggle + Save button (one line)
- One-line description in muted text

`ApiKeyRow` state: `localValue` (controlled input seeded from `value` prop), `show` (toggles password↔text), `saved` (shows "✓ Saved" for 1500ms after save).

`handleSave`: calls `await onSave(localValue)`, sets `saved: true`, `setTimeout(() => setSaved(false), 1500)`.

Inline styles use existing CSS vars: `--color-surface-2`, `--color-border-2`, `--color-accent`, `--color-text-dim`, `--color-text-muted`, `--radius-sm`, `--font-mono`.

`SettingsPanel` export:
```typescript
export function SettingsPanel() {
  const { ollamaApiKey, braveApiKey, setOllamaApiKey, setBraveApiKey } = useSettingsStore();
  return (
    <div style={{ paddingBottom: 8 }}>
      <div style={{ /* "API KEYS" section label */ }}>API Keys</div>
      <ApiKeyRow label="Ollama Cloud" ... value={ollamaApiKey} onSave={setOllamaApiKey} />
      <ApiKeyRow label="Brave Search" ... value={braveApiKey} onSave={setBraveApiKey} />
    </div>
  );
}
```

---

## Files to Modify

### `src/hooks/useModels.ts`

Add import: `import { useSettingsStore } from "../stores/settingsStore";`

Replace `useSearchConfig()` — remove the `useQuery` block, replace with:
```typescript
export function useSearchConfig() {
  const ollamaApiKey = useSettingsStore((s) => s.ollamaApiKey);
  const braveApiKey = useSettingsStore((s) => s.braveApiKey);
  return { data: { ollamaKey: ollamaApiKey || null, braveKey: braveApiKey || null } };
}
```

Replace `useCloudConfig()` — remove the `useQuery` block, replace with:
```typescript
export function useCloudConfig() {
  const ollamaApiKey = useSettingsStore((s) => s.ollamaApiKey);
  return { data: { apiKey: ollamaApiKey || null } };
}
```

All call sites unchanged: `const { data: config } = useSearchConfig()` and `const { data: cloudConfig } = useCloudConfig()` still work. These hooks are now synchronous and reactive — components re-render when the store updates.

Also update `CloudPanel`'s no-key message (in `ModelManager.tsx`) from "Add `ollama_cloud_api_key` to config.json" to "Open Settings to add an Ollama Cloud API key."

### `src/components/search/SearchPanel.tsx`

Add `interface Props { onOpenSettings: () => void }` and update function signature.

Update `ProviderRowProps`: replace `hint`, `hintLink`, `hintLinkLabel` with `onDisabledClick: () => void`. Remove `expanded` state entirely. Remove the `{!enabled && expanded && ...}` config.json hint block.

New `handleClick`:
```typescript
const handleClick = () => {
  if (!enabled) { onDisabledClick(); return; }
  onSelect();
};
```

Change `cursor` for disabled buttons from `"not-allowed"` to `"pointer"` (clicking opens Settings, so it's actionable). Update `title` to `"Open Settings to add an API key"`.

Pass `onDisabledClick={onOpenSettings}` to both `<ProviderRow>` instances.

### `src/components/layout/Sidebar.tsx`

1. Add `"settings"` to the Section type: `type Section = "models" | "cloud" | "skills" | "mcp" | "search" | "settings" | null;`

2. Add import: `import { SettingsPanel } from "../settings/SettingsPanel";`

3. Pass callback to SearchPanel: `{open === "search" && <SearchPanel onOpenSettings={() => setOpen("settings")} />}`

4. Add Settings section as last item in the scrollable div (after Web Search), following identical accordion pattern as other sections:
```tsx
<div style={{ marginTop: 2 }}>
  <button onClick={() => toggle("settings")} style={{ /* same as other section buttons */ }}>
    {open === "settings" ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
    Settings
  </button>
  {open === "settings" && <SettingsPanel />}
</div>
```

### `src/App.tsx`

Add `useSettingsStore` import. Add `initializeSettings` alongside `initializePermissions` in the startup `useEffect`:

```typescript
const initializeSettings = useSettingsStore((s) => s.initialize);

useEffect(() => {
  initSessions().then((session) => { setCurrentSession(...); });
  initializePermissions();
  initializeSettings();
}, [setCurrentSession, initializePermissions, initializeSettings]);
```

---

## Implementation Order

1. `settingsStore.ts` — everything depends on this
2. `useModels.ts` — connects store to all existing consumers
3. `SettingsPanel.tsx` — standalone UI
4. `SearchPanel.tsx` — new prop interface
5. `Sidebar.tsx` — imports both, passes callback
6. `App.tsx` — adds initialize call

---

## Test Checklist

- **Fresh install**: both keys empty; SettingsPanel shows empty inputs; SearchPanel rows show tooltip "Open Settings to add an API key"; clicking a disabled row opens Settings section
- **Existing install with config.json**: on first launch keys migrate to plugin-store; subsequent launches read from plugin-store only
- **Save Ollama key**: "✓ Saved" flashes; `useCloudConfig()` becomes non-null; CloudPanel loads models
- **Save Brave key**: Brave Search row becomes enabled and selectable
- **Disabled provider click → Settings opens**: Settings accordion opens; previously-open section closes
- **Eye toggle**: input switches password↔text
- **Whitespace-only save**: saves as empty string; key becomes `null` in hook output
- **App restart**: keys persist from plugin-store
- **Double init (Strict Mode)**: second `initialize()` call returns immediately via `initialized` guard
- **Malformed config.json migration**: catch block sets `initialized: true` with empty keys; no crash
- **Regressions**: cloud models, capabilities, context bar, MCP, Skills, Models sections all unaffected
