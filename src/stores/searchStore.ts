import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type SearchProvider = "ollama" | "brave";

interface SearchState {
  provider: SearchProvider | null;
  setProvider: (p: SearchProvider | null) => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      provider: null,
      setProvider: (provider) => set({ provider }),
    }),
    {
      name: "search-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
