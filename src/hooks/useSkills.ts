import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SkillMeta } from "../types/skill";
import { useSkillStore } from "../stores/skillStore";
import { parseSkillContent } from "../utils/skillLoader";

export async function refreshSkills() {
  const skills = await invoke<SkillMeta[]>("list_skills");
  useSkillStore.getState().setAvailable(skills);
}

export function useSkills() {
  const { available, active, setAvailable, activateSkill, deactivateSkill, isActive } = useSkillStore();

  useEffect(() => {
    invoke<SkillMeta[]>("list_skills").then(setAvailable).catch(console.error);
  }, [setAvailable]);

  const toggleSkill = async (meta: SkillMeta) => {
    if (isActive(meta.id)) {
      deactivateSkill(meta.id);
    } else {
      try {
        const content = await invoke<string>("read_skill_file", { path: meta.path });
        const skill = parseSkillContent(meta.id, meta.path, content);
        activateSkill(meta.id, skill);
      } catch (e) {
        console.error("Failed to load skill:", e);
      }
    }
  };

  return { available, active, toggleSkill, isActive };
}
