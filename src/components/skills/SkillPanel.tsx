import { useSkills } from "../../hooks/useSkills";

export function SkillPanel() {
  const { available, toggleSkill, isActive } = useSkills();

  if (available.length === 0) {
    return <p style={{ padding: "6px 18px", fontSize: 12, color: "var(--color-text-muted)" }}>No skills found</p>;
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      {available.map((skill) => {
        const active = isActive(skill.id);
        return (
          <button
            key={skill.id}
            onClick={() => toggleSkill(skill)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "7px 12px",
              background: active ? "var(--color-accent-dim)" : "transparent",
              border: "none",
              borderLeft: active ? "2px solid var(--color-accent)" : "2px solid transparent",
              transition: "background 0.15s, border-color 0.15s",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: active ? "var(--color-accent)" : "var(--color-border-2)",
                transition: "background 0.15s",
              }} />
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: active ? "var(--color-accent)" : "var(--color-text-dim)",
                letterSpacing: "0.3px",
                transition: "color 0.15s",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {skill.name}
              </span>
            </div>
            {skill.description && (
              <p style={{
                fontSize: 11, color: "var(--color-text-muted)", marginTop: 2,
                paddingLeft: 12, lineHeight: 1.4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {skill.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
