import { useEffect } from "react";
import { Check } from "lucide-react";
import { useSearchStore, type SearchProvider } from "../../stores/searchStore";
import { useSearchConfig } from "../../hooks/useModels";

interface ProviderRowProps {
  label: string;
  enabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onDisabledClick: () => void;
}

function ProviderRow({ label, enabled, selected, onSelect, onDisabledClick }: ProviderRowProps) {
  const handleClick = () => {
    if (!enabled) {
      onDisabledClick();
      return;
    }
    onSelect();
  };

  return (
    <button
      onClick={handleClick}
      title={enabled ? undefined : "Open Settings to add an API key"}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 18px 8px 14px",
        background: selected ? "var(--color-surface-2)" : "none",
        border: "none",
        borderLeft: selected ? "2.5px solid var(--color-accent)" : "2.5px solid transparent",
        cursor: "pointer",
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
  );
}

interface Props {
  onOpenSettings: () => void;
}

export function SearchPanel({ onOpenSettings }: Props) {
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
        enabled={ollamaEnabled}
        selected={provider === "ollama"}
        onSelect={makeSelect("ollama")}
        onDisabledClick={onOpenSettings}
      />
      <ProviderRow
        label="Brave Search"
        enabled={braveEnabled}
        selected={provider === "brave"}
        onSelect={makeSelect("brave")}
        onDisabledClick={onOpenSettings}
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
