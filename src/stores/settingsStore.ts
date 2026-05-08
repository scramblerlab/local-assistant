import { LazyStore } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

const _store = new LazyStore("settings.json", { defaults: {}, autoSave: false });

interface SettingsState {
  ollamaApiKey: string;
  braveApiKey: string;
  initialized: boolean;
  initialize: () => Promise<void>;
  setOllamaApiKey: (key: string) => Promise<void>;
  setBraveApiKey: (key: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ollamaApiKey: "",
  braveApiKey: "",
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    await _store.init();

    const [storedOllama, storedBrave] = await Promise.all([
      _store.get<string>("ollama_api_key"),
      _store.get<string>("brave_api_key"),
    ]);

    // If plugin-store already has data, use it directly (skip migration)
    if (storedOllama !== undefined || storedBrave !== undefined) {
      set({
        ollamaApiKey: storedOllama?.trim() ?? "",
        braveApiKey: storedBrave?.trim() ?? "",
        initialized: true,
      });
      return;
    }

    // First run: migrate from config.json if it exists
    try {
      const raw = await invoke<string>("read_file", { path: "~/.local-assistant/config.json" });
      const parsed = JSON.parse(raw);
      const ollamaKey = (parsed?.ollama_cloud_api_key as string | undefined)?.trim() ?? "";
      const braveKey = (parsed?.brave_search_api_key as string | undefined)?.trim() ?? "";
      if (ollamaKey) await _store.set("ollama_api_key", ollamaKey);
      if (braveKey) await _store.set("brave_api_key", braveKey);
      if (ollamaKey || braveKey) await _store.save();
      set({ ollamaApiKey: ollamaKey, braveApiKey: braveKey, initialized: true });
    } catch {
      // No config.json — start with empty keys
      set({ initialized: true });
    }
  },

  setOllamaApiKey: async (key: string) => {
    const trimmed = key.trim();
    try {
      await _store.set("ollama_api_key", trimmed);
      await _store.save();
    } catch (e) {
      console.warn("settingsStore: failed to save ollama key", e);
    }
    set({ ollamaApiKey: trimmed });
  },

  setBraveApiKey: async (key: string) => {
    const trimmed = key.trim();
    try {
      await _store.set("brave_api_key", trimmed);
      await _store.save();
    } catch (e) {
      console.warn("settingsStore: failed to save brave key", e);
    }
    set({ braveApiKey: trimmed });
  },
}));
