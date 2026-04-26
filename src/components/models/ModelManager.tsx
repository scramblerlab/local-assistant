import { Check, Trash2 } from "lucide-react";
import { useInstalledModels, useDeleteModel, useActiveModel } from "../../hooks/useModels";
import { ModelPullForm } from "./ModelPullForm";

function formatSize(bytes: number) {
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)}G` : `${(bytes / 1e6).toFixed(0)}M`;
}

export function ModelManager() {
  const { data: models, isLoading } = useInstalledModels();
  const { mutate: deleteModel } = useDeleteModel();
  const { activeModel, setActiveModel } = useActiveModel();

  return (
    <div style={{ paddingBottom: 4 }}>
      {/* Pull form */}
      <div style={{ padding: "6px 12px 0", marginBottom: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.8px", textTransform: "uppercase" }}>
          Pull new
        </span>
      </div>
      <ModelPullForm />

      {/* Installed */}
      <div style={{ padding: "4px 12px 4px" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.8px", textTransform: "uppercase" }}>
          Installed
        </span>
      </div>
      {isLoading && <p style={{ padding: "4px 18px", fontSize: 12, color: "var(--color-text-muted)" }}>Loading…</p>}
      {models?.length === 0 && <p style={{ padding: "4px 18px", fontSize: 12, color: "var(--color-text-muted)" }}>None yet</p>}
      <div>
        {models?.map((m) => {
          const isActive = m.name === activeModel;
          return (
            <div
              key={m.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: isActive ? "var(--color-accent-dim)" : "transparent",
                borderLeft: isActive ? "2px solid var(--color-accent)" : "2px solid transparent",
                transition: "background 0.15s",
              }}
              className="model-row"
            >
              <button onClick={() => setActiveModel(m.name)} style={{
                flex: 1, textAlign: "left", display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none", padding: 0, minWidth: 0,
              }}>
                <Check size={11} style={{ color: "var(--color-accent)", opacity: isActive ? 1 : 0, flexShrink: 0 }} />
                <span style={{
                  fontSize: 12, fontFamily: "var(--font-mono)",
                  color: isActive ? "var(--color-accent)" : "var(--color-text-dim)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  transition: "color 0.15s",
                }}>
                  {m.name}
                </span>
              </button>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>{formatSize(m.size)}</span>
              <button
                onClick={() => { if (confirm(`Delete ${m.name}?`)) deleteModel(m.name); }}
                style={{
                  background: "none", border: "none", padding: 2,
                  color: "var(--color-text-muted)", flexShrink: 0,
                  opacity: 0, transition: "opacity 0.15s, color 0.15s",
                }}
                className="delete-btn"
              >
                <Trash2 size={11} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        .model-row:hover .delete-btn { opacity: 1 !important; }
        .model-row:hover .delete-btn:hover { color: var(--color-red) !important; }
      `}</style>
    </div>
  );
}
