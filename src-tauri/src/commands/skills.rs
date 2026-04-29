use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SkillMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
}

fn skills_dir(app: &tauri::AppHandle) -> PathBuf {
    crate::commands::fs_ops::app_data_dir(app).join("skills")
}

fn parse_frontmatter_field(content: &str, field: &str) -> Option<String> {
    for line in content.lines() {
        let prefix = format!("{field}:");
        if let Some(rest) = line.strip_prefix(&prefix) {
            let val = rest.trim().trim_matches('"').trim_matches('\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn extract_frontmatter(content: &str) -> Option<String> {
    let content = content.trim_start();
    if !content.starts_with("---") {
        return None;
    }
    let rest = &content[3..];
    let end = rest.find("\n---")?;
    Some(rest[..end].to_string())
}

#[tauri::command]
pub async fn list_skills(app_handle: tauri::AppHandle) -> Vec<SkillMeta> {
    let dir = skills_dir(&app_handle);
    let mut skills = Vec::new();

    if !dir.exists() {
        return skills;
    }

    for entry in WalkDir::new(&dir).min_depth(1).max_depth(1) {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_dir() {
            continue;
        }
        let skill_dir = entry.path();
        let skill_md = skill_dir.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&skill_md) else {
            continue;
        };
        let id = skill_dir
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let (name, description) = if let Some(fm) = extract_frontmatter(&content) {
            let name = parse_frontmatter_field(&fm, "name").unwrap_or_else(|| id.clone());
            let description = parse_frontmatter_field(&fm, "description").unwrap_or_default();
            (name, description)
        } else {
            (id.clone(), String::new())
        };

        skills.push(SkillMeta {
            id,
            name,
            description,
            path: skill_md.to_string_lossy().to_string(),
        });
    }
    skills
}

#[tauri::command]
pub async fn read_skill_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read skill file: {e}"))
}
