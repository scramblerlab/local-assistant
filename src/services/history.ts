import { invoke } from "@tauri-apps/api/core";
import type { Turn } from "../types/chat";

const HISTORY_PATH = "~/.local-assistant/history.json";

export interface PersistedHistory {
  turns: Turn[];
  compactSummary: string | null;
}

export async function saveHistory(turns: Turn[], compactSummary: string | null): Promise<void> {
  const payload: PersistedHistory = {
    // Don't persist in-flight streaming turns
    turns: turns.filter((t) => !t.isStreaming),
    compactSummary,
  };
  await invoke("write_file", {
    path: HISTORY_PATH,
    content: JSON.stringify(payload, null, 2),
  });
}

export async function loadHistory(): Promise<PersistedHistory> {
  try {
    const raw = await invoke<string>("read_file", { path: HISTORY_PATH });
    const parsed = JSON.parse(raw) as PersistedHistory;
    // Sanitise: ensure no stale streaming state survives a restart
    return {
      turns: (parsed.turns ?? []).map((t) => ({ ...t, isStreaming: false })),
      compactSummary: parsed.compactSummary ?? null,
    };
  } catch {
    return { turns: [], compactSummary: null };
  }
}
