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
  const { available, active, setAvailable, activateSkill, isActive } = useSkillStore();

  useEffect(() => {
    invoke<SkillMeta[]>("list_skills").then(async (skills) => {
      setAvailable(skills);
      await Promise.all(
        skills.map(async (meta) => {
          if (isActive(meta.id)) return;
          try {
            const content = await invoke<string>("read_skill_file", { path: meta.path });
            activateSkill(meta.id, parseSkillContent(meta.id, meta.path, content));
          } catch (e) {
            console.error("Failed to load skill:", meta.id, e);
          }
        })
      );
    }).catch(console.error);
  }, [setAvailable, activateSkill, isActive]);

  return { available, active };
}
