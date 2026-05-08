import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";

interface ApiKeyRowProps {
  label: string;
  description: string;
  linkHref: string;
  linkLabel: string;
  value: string;
  onSave: (key: string) => Promise<void>;
}

function ApiKeyRow({ label, description, linkHref, linkLabel, value, onSave }: ApiKeyRowProps) {
  const [localValue, setLocalValue] = useState(value);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localValue);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = localValue.trim() !== value;

  return (
    <div style={{ padding: "8px 18px 10px" }}>
      {/* Label + link */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-dim)" }}>
          {label}
        </span>
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: "var(--color-accent)", textDecoration: "none" }}
        >
          {linkLabel} ↗
        </a>
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type={show ? "text" : "password"}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="Paste your key here"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "var(--color-surface-2)",
              border: "1.5px solid var(--color-border-2)",
              borderRadius: "var(--radius-sm)",
              padding: "5px 30px 5px 8px",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-dim)",
              outline: "none",
            }}
          />
          <button
            onClick={() => setShow((v) => !v)}
            title={show ? "Hide key" : "Show key"}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-text-muted)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {show ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "5px 12px",
            background: saved ? "var(--color-green, #22c55e)" : "var(--color-accent)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            color: "#000",
            fontSize: 11,
            fontWeight: 700,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
            flexShrink: 0,
            transition: "background 0.2s",
            minWidth: 52,
          }}
        >
          {saved ? "✓ Saved" : isDirty ? "Save" : "Save"}
        </button>
      </div>

      {/* Description */}
      <div style={{ marginTop: 5, fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
        {description}
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const { ollamaApiKey, braveApiKey, setOllamaApiKey, setBraveApiKey } = useSettingsStore();

  return (
    <div style={{ paddingBottom: 8 }}>
      <div style={{
        padding: "4px 18px 6px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
      }}>
        API Keys
      </div>

      <ApiKeyRow
        label="Ollama Cloud"
        description="Required for cloud models and Ollama web search."
        linkHref="https://ollama.com/settings/keys"
        linkLabel="Get a key"
        value={ollamaApiKey}
        onSave={setOllamaApiKey}
      />

      <ApiKeyRow
        label="Brave Search"
        description="Required for Brave web search provider."
        linkHref="https://brave.com/search/api/"
        linkLabel="Get a free key"
        value={braveApiKey}
        onSave={setBraveApiKey}
      />
    </div>
  );
}
