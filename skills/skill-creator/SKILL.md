---
name: skill-creator
description: Creates new Agent Skills by generating SKILL.md files. Activates when the user asks to create, build, or define a new skill.
license: MIT
allowed-tools:
  - write_file
---

## Purpose

Help the user design and create new Agent Skills following the agentskills.io specification. A skill is a directory containing a `SKILL.md` file with YAML frontmatter and markdown instructions.

## Skill File Format

```markdown
---
name: skill-name              # lowercase, hyphens only, max 64 chars
description: What this skill does and when to activate it  # max 1024 chars
license: MIT                  # optional
allowed-tools: []             # optional: list of tools the skill may invoke
---

## Instructions

Markdown body with guidance for the LLM. Keep it under 500 lines.
```

## Workflow

When the user asks to create a new skill:

1. **Gather requirements**: Ask what the skill should do, when it should activate, and what tools it needs.
2. **Draft the SKILL.md**: Write a concise, focused `SKILL.md` with:
   - A clear `name` (directory name, lowercase-hyphens)
   - A `description` that explains what the skill does *and* when an agent should activate it
   - Markdown body with step-by-step instructions, examples, and edge cases
3. **Propose the file path**: `~/.local-assistant/skills/<name>/SKILL.md`
4. **Write the file**: Use `write_file` to save it to the skills directory.
5. **Confirm**: Tell the user the skill is ready and can be activated from the sidebar.

## Design Principles

- **Progressive disclosure**: Keep SKILL.md lean (<500 lines). Put detailed references in `references/` subdirectories.
- **Context efficiency**: Only include information the LLM cannot infer from general knowledge.
- **Single responsibility**: Each skill should do one thing well.
- **Activation clarity**: The `description` should make it obvious when to use the skill.

## Example

User: "Create a skill that helps write git commit messages"

```markdown
---
name: git-commit
description: Writes conventional git commit messages. Activates when the user asks to commit, stage, or write a commit message.
---

## Instructions

When the user wants to commit changes:
1. Ask for a summary of what changed if not provided
2. Identify the change type: feat, fix, docs, refactor, test, chore
3. Write a commit message: `<type>(<scope>): <short summary>`
4. Keep the subject line under 72 characters
5. Add a body paragraph if the change needs explanation
```
