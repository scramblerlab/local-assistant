import { create } from "zustand";
import { startMcpServers, reloadMcpServers } from "../services/mcp";
import type { McpServerSummary } from "../services/mcp";

interface McpState {
  servers: McpServerSummary[];
  loading: boolean;
  initialize: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  loading: false,

  initialize: async () => {
    if (get().servers.length > 0) return; // already started
    set({ loading: true });
    try {
      const servers = await startMcpServers();
      set({ servers, loading: false });
    } catch (e) {
      console.warn("[mcp] initialize failed:", e);
      set({ loading: false });
    }
  },

  reload: async () => {
    set({ loading: true });
    try {
      const servers = await reloadMcpServers();
      set({ servers, loading: false });
    } catch (e) {
      console.warn("[mcp] reload failed:", e);
      set({ loading: false });
    }
  },
}));
