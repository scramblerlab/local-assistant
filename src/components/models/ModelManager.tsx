import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useInstalledModels, useDeleteModel, useActiveModel, useModelCapabilities, useCloudConfig, useCloudModels, useCloudModelCapabilities } from "../../hooks/useModels";
import { ModelPullForm } from "./ModelPullForm";
import type { OllamaModel } from "../../types/ollama";

function formatSize(bytes: number) {
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)}G` : `${(bytes / 1e6).toFixed(0)}M`;
}

interface ModelRowProps {
  m: OllamaModel;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function ModelRow({ m, isActive, onSelect, onDelete }: ModelRowProps) {
  const { supportsVision } = useModelCapabilities(m.name);
  const isCloudHosted = m.name.endsWith(":cloud") || m.size === 0;

  return (
    <div
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
      <button onClick={onSelect} style={{
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
      {isCloudHosted && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase",
          fontFamily: "var(--font-mono)", color: "var(--color-accent)",
          background: "var(--color-accent-dim)", border: "1.5px solid var(--color-accent)",
          borderRadius: "var(--radius-pill)", padding: "1px 5px", flexShrink: 0,
        }}>
          cloud
        </span>
      )}
      {supportsVision && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase",
          fontFamily: "var(--font-mono)", color: "var(--color-text-muted)",
          background: "var(--color-surface-2)", border: "1.5px solid var(--color-border-2)",
          borderRadius: "var(--radius-pill)", padding: "1px 5px", flexShrink: 0,
        }}>
          vision
        </span>
      )}
      {!isCloudHosted && (
        <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>{formatSize(m.size)}</span>
      )}
      <button
        onClick={onDelete}
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
}

interface CloudModelRowProps {
  m: OllamaModel;
  isActive: boolean;
  apiKey: string;
  onSelect: () => void;
}

function CloudModelRow({ m, isActive, apiKey, onSelect }: CloudModelRowProps) {
  const { data: caps } = useCloudModelCapabilities(m.name, apiKey);
  const supportsVision = (caps ?? []).includes("vision");

  const modifiedAt = m.modified_at
    ? new Date(m.modified_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <div
      style={{
        padding: "5px 12px",
        background: isActive ? "var(--color-accent-dim)" : "transparent",
        borderLeft: isActive ? "2px solid var(--color-accent)" : "2px solid transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={onSelect} style={{
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
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase",
          fontFamily: "var(--font-mono)", color: "var(--color-accent)",
          background: "var(--color-accent-dim)", border: "1.5px solid var(--color-accent)",
          borderRadius: "var(--radius-pill)", padding: "1px 5px", flexShrink: 0,
        }}>
          cloud
        </span>
        {supportsVision && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase",
            fontFamily: "var(--font-mono)", color: "var(--color-text-muted)",
            background: "var(--color-surface-2)", border: "1.5px solid var(--color-border-2)",
            borderRadius: "var(--radius-pill)", padding: "1px 5px", flexShrink: 0,
          }}>
            vision
          </span>
        )}
      </div>
      {modifiedAt && (
        <div style={{ paddingLeft: 17, marginTop: 1, fontSize: 10, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
          modified_at: {modifiedAt}
        </div>
      )}
    </div>
  );
}

type SortKey = "az" | "za" | "newest" | "oldest";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "az",     label: "A → Z" },
  { value: "za",     label: "Z → A" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

export function CloudPanel() {
  const { activeModel, setActiveModel } = useActiveModel();
  const { data: cloudConfig } = useCloudConfig();
  const apiKey = cloudConfig?.apiKey ?? null;
  const { data: cloudModels, isLoading } = useCloudModels();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("az");

  if (!apiKey) {
    return (
      <p style={{ padding: "4px 18px 8px", fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
        Add <code style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>ollama_cloud_api_key</code> to config.json to enable
      </p>
    );
  }

  const filtered = filter.trim()
    ? (cloudModels ?? []).filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()))
    : (cloudModels ?? []);

  const visible = [...filtered].sort((a, b) => {
    if (sort === "az") return a.name.localeCompare(b.name);
    if (sort === "za") return b.name.localeCompare(a.name);
    const ta = a.modified_at ? new Date(a.modified_at).getTime() : 0;
    const tb = b.modified_at ? new Date(b.modified_at).getTime() : 0;
    return sort === "newest" ? tb - ta : ta - tb;
  });

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ padding: "4px 12px 4px" }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter models…"
          style={{
            width: "100%",
            background: "var(--color-surface-2)",
            border: "1.5px solid var(--color-border-2)",
            borderRadius: "var(--radius-sm)",
            padding: "5px 8px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-dim)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSort(opt.value)}
            style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.5px",
              padding: "2px 7px",
              border: "1.5px solid",
              borderColor: sort === opt.value ? "var(--color-accent)" : "var(--color-border-2)",
              borderRadius: "var(--radius-pill)",
              background: sort === opt.value ? "var(--color-accent-dim)" : "transparent",
              color: sort === opt.value ? "var(--color-accent)" : "var(--color-text-muted)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {isLoading && <p style={{ padding: "4px 18px", fontSize: 12, color: "var(--color-text-muted)" }}>Loading…</p>}
      {!isLoading && visible.length === 0 && (
        <p style={{ padding: "4px 18px", fontSize: 12, color: "var(--color-text-muted)" }}>
          {filter.trim() ? "No matches" : "No cloud models found"}
        </p>
      )}
      {visible.map((m) => (
        <CloudModelRow
          key={m.name}
          m={m}
          isActive={m.name === activeModel}
          apiKey={apiKey}
          onSelect={() => setActiveModel(m.name)}
        />
      ))}
    </div>
  );
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
        {models?.map((m) => (
          <ModelRow
            key={m.name}
            m={m}
            isActive={m.name === activeModel}
            onSelect={() => setActiveModel(m.name)}
            onDelete={() => { if (confirm(`Delete ${m.name}?`)) deleteModel(m.name); }}
          />
        ))}
      </div>

      <style>{`
        .model-row:hover .delete-btn { opacity: 1 !important; }
        .model-row:hover .delete-btn:hover { color: var(--color-red) !important; }
      `}</style>
    </div>
  );
}
