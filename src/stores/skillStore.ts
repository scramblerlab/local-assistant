import { create } from "zustand";
import type { Skill, SkillMeta } from "../types/skill";

interface SkillState {
  available: SkillMeta[];
  active: Map<string, Skill>;
  setAvailable: (skills: SkillMeta[]) => void;
  activateSkill: (id: string, skill: Skill) => void;
  deactivateSkill: (id: string) => void;
  isActive: (id: string) => boolean;
  getActiveSkills: () => Skill[];
}

export const useSkillStore = create<SkillState>((set, get) => ({
  available: [],
  active: new Map(),

  setAvailable: (skills) => set({ available: skills }),

  activateSkill: (id, skill) =>
    set((s) => {
      const next = new Map(s.active);
      next.set(id, skill);
      return { active: next };
    }),

  deactivateSkill: (id) =>
    set((s) => {
      const next = new Map(s.active);
      next.delete(id);
      return { active: next };
    }),

  isActive: (id) => get().active.has(id),

  getActiveSkills: () => Array.from(get().active.values()),
}));
