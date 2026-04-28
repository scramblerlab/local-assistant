import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ModelState {
  activeModel: string;
  isCloudModel: boolean;
  setActiveModel: (name: string, isCloud?: boolean) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      activeModel: "",
      isCloudModel: false,
      setActiveModel: (name, isCloud = false) => set({ activeModel: name, isCloudModel: isCloud }),
    }),
    {
      name: "model-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
