import yaml from "js-yaml";
import type { Skill, SkillFrontmatter } from "../types/skill";

function splitFrontmatter(raw: string): { fm: string; body: string } | null {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) return null;
  const rest = trimmed.slice(3);
  const idx = rest.indexOf("\n---");
  if (idx === -1) return null;
  return { fm: rest.slice(0, idx), body: rest.slice(idx + 4).trimStart() };
}

export function parseSkillContent(id: string, path: string, raw: string): Skill {
  const parts = splitFrontmatter(raw);
  let frontmatter: SkillFrontmatter = { name: id, description: "" };
  let body = raw;

  if (parts) {
    try {
      const data = yaml.load(parts.fm) as Record<string, unknown>;
      frontmatter = {
        name: (data?.name as string) ?? id,
        description: (data?.description as string) ?? "",
        license: data?.license as string | undefined,
        compatibility: data?.compatibility as string | undefined,
        allowedTools: (data?.["allowed-tools"] as string[]) ?? [],
        metadata: data?.metadata as Record<string, unknown> | undefined,
      };
    } catch {
      // use defaults
    }
    body = parts.body;
  }

  return { id, path, frontmatter, body };
}
