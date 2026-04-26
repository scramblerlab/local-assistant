import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ModelState {
  activeModel: string;
  setActiveModel: (name: string) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      activeModel: "",
      setActiveModel: (name) => set({ activeModel: name }),
    }),
    {
      name: "model-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
