export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
  metadata?: Record<string, unknown>;
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface Skill {
  id: string;
  path: string;
  frontmatter: SkillFrontmatter;
  body: string;
}
