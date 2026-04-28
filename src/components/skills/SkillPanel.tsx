import { useSkills } from "../../hooks/useSkills";

export function SkillPanel() {
  const { available } = useSkills();

  if (available.length === 0) {
    return <p style={{ padding: "6px 18px", fontSize: 12, color: "var(--color-text-muted)" }}>No skills found</p>;
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      {available.map((skill) => (
        <div
          key={skill.id}
          style={{
            padding: "7px 12px",
            borderLeft: "2px solid transparent",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: "var(--color-accent)",
            }} />
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: "var(--color-text-dim)",
              letterSpacing: "0.3px",
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
        </div>
      ))}
    </div>
  );
}
