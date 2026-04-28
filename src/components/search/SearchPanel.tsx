import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { useSearchStore, type SearchProvider } from "../../stores/searchStore";
import { useSearchConfig } from "../../hooks/useModels";

interface ProviderRowProps {
  label: string;
  hint: string;
  hintLink: string;
  hintLinkLabel: string;
  enabled: boolean;
  selected: boolean;
  onSelect: () => void;
}

function ProviderRow({ label, hint, hintLink, hintLinkLabel, enabled, selected, onSelect }: ProviderRowProps) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (!enabled) {
      setExpanded((v) => !v);
      return;
    }
    onSelect();
  };

  return (
    <div>
      <button
        onClick={handleClick}
        title={enabled ? undefined : `${hint}`}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 18px 8px 14px",
          background: selected ? "var(--color-surface-2)" : "none",
          border: "none",
          borderLeft: selected ? "2.5px solid var(--color-accent)" : "2.5px solid transparent",
          cursor: enabled ? "pointer" : "not-allowed",
          opacity: enabled ? 1 : 0.4,
          transition: "background 0.15s, opacity 0.15s",
          textAlign: "left",
        }}
      >
        <span style={{
          width: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          {selected && <Check size={11} color="var(--color-accent)" />}
        </span>
        <span style={{
          fontSize: 12,
          color: selected ? "var(--color-text-primary)" : "var(--color-text-dim)",
          fontFamily: "var(--font-sans)",
          fontWeight: selected ? 600 : 400,
          flex: 1,
        }}>
          {label}
        </span>
      </button>

      {!enabled && expanded && (
        <div style={{
          margin: "0 14px 8px",
          padding: "8px 10px",
          background: "var(--color-surface-2)",
          borderRadius: "var(--radius)",
          fontSize: 11,
          color: "var(--color-text-muted)",
          lineHeight: 1.5,
        }}>
          Add <code style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{hint}</code> to{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>~/.local-assistant/config.json</code>
          {" — "}
          <a
            href={hintLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-accent)", textDecoration: "none" }}
          >
            {hintLinkLabel}
          </a>
        </div>
      )}
    </div>
  );
}

export function SearchPanel() {
  const { provider, setProvider } = useSearchStore();
  const { data: config } = useSearchConfig();

  const ollamaEnabled = !!config?.ollamaKey;
  const braveEnabled = !!config?.braveKey;

  useEffect(() => {
    if (config && provider === null) {
      if (config.ollamaKey) setProvider("ollama");
      else if (config.braveKey) setProvider("brave");
    }
  }, [config, provider, setProvider]);

  const makeSelect = (id: SearchProvider) => () => {
    setProvider(provider === id ? null : id);
  };

  return (
    <div style={{ paddingBottom: 8 }}>
      <ProviderRow
        label="Ollama Web Search"
        hint="ollama_cloud_api_key"
        hintLink="https://ollama.com/settings/keys"
        hintLinkLabel="get a key at ollama.com"
        enabled={ollamaEnabled}
        selected={provider === "ollama"}
        onSelect={makeSelect("ollama")}
      />
      <ProviderRow
        label="Brave Search"
        hint="brave_search_api_key"
        hintLink="https://brave.com/search/api/"
        hintLinkLabel="get a free key at brave.com"
        enabled={braveEnabled}
        selected={provider === "brave"}
        onSelect={makeSelect("brave")}
      />
      {!provider && (
        <div style={{
          padding: "6px 18px 0",
          fontSize: 11,
          color: "var(--color-text-muted)",
          lineHeight: 1.4,
        }}>
          No provider selected — web search will return an error.
        </div>
      )}
    </div>
  );
}
