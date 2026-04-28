import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import type { OllamaStatus } from "../../hooks/useOllamaHealth";
import { useActiveModel, useCloudConfig, useCloudModelContextLength } from "../../hooks/useModels";
import { ModelManager, CloudPanel } from "../models/ModelManager";
import { SkillPanel } from "../skills/SkillPanel";
import { McpPanel } from "../mcp/McpPanel";
import { SearchPanel } from "../search/SearchPanel";
import { useMcpStore } from "../../stores/mcpStore";
import { useChatStore } from "../../stores/chatStore";
import { useModelStore } from "../../stores/modelStore";
import { getModelContextLength } from "../../services/ollama";
import { estimateMessageTokens } from "../../utils/tokenEstimate";

interface Props {
  ollamaStatus: OllamaStatus;
}

function StatusDot({ status }: { status: OllamaStatus }) {
  const isActive = status === "running";
  const isPulsing = status === "checking" || status === "starting";
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        flexShrink: 0,
        background: isActive ? "var(--color-green)" : isPulsing ? "var(--color-accent)" : "var(--color-red)",
        animation: isPulsing ? "dot-pulse 1.4s ease-in-out infinite" : undefined,
      }}
    />
  );
}

function ContextUsageBar({ model }: { model: string }) {
  const turns = useChatStore((s) => s.turns);
  const compactSummary = useChatStore((s) => s.compactSummary);
  const isCloud = useModelStore((s) => s.isCloudModel);
  const { data: cloudConfig } = useCloudConfig();
  const { data: cloudContextLength } = useCloudModelContextLength(
    model,
    isCloud ? (cloudConfig?.apiKey ?? null) : null
  );
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    if (!model) { setUsage(null); return; }

    const getLimit = isCloud
      ? Promise.resolve(cloudContextLength ?? null)
      : getModelContextLength(model).then((n) => n);

    let cancelled = false;
    getLimit.then((limit) => {
      if (limit === null) return; // cloud length not loaded yet
      if (cancelled) return;
      let used = 0;
      if (compactSummary) used += estimateMessageTokens("system", compactSummary);
      for (const t of turns.filter((t) => !t.isCompact && !t.isStreaming)) {
        used += estimateMessageTokens("user", t.userMessage);
        used += estimateMessageTokens(
          "assistant",
          t.segments.filter((s) => s.kind !== "thinking").map((s) => s.content).join("")
        );
      }
      setUsage({ used, limit });
    });
    return () => { cancelled = true; };
  }, [model, isCloud, cloudContextLength, turns, compactSummary]);

  if (!usage) return null;

  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const barColor =
    pct >= 85 ? "var(--color-red)" :
    pct >= 65 ? "var(--color-accent)" :
    "var(--color-green)";

  function fmt(n: number) {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  }

  return (
    <div style={{
      padding: "12px 18px 14px",
      borderTop: "1.5px solid var(--color-border)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.8px",
          textTransform: "uppercase", color: "var(--color-text-muted)",
        }}>
          Context
        </span>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
          {fmt(usage.used)} / {fmt(usage.limit)}
        </span>
      </div>
      {/* Track */}
      <div style={{
        height: 3, borderRadius: "var(--radius-pill)",
        background: "var(--color-surface-2)",
      }}>
        <div style={{
          height: 3, borderRadius: "var(--radius-pill)",
          width: `${pct}%`,
          background: barColor,
          transition: "width 0.4s ease, background 0.4s ease",
        }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 10, color: "var(--color-text-muted)", textAlign: "right" }}>
        {pct}% used
      </div>
    </div>
  );
}

type Section = "models" | "cloud" | "skills" | "mcp" | "search" | null;

export function Sidebar({ ollamaStatus }: Props) {
  const [open, setOpen] = useState<Section>("models");
  const { activeModel } = useActiveModel();
  const { loading: mcpLoading, reload: mcpReload } = useMcpStore();

  const toggle = (s: Section) => setOpen((v) => (v === s ? null : s));

  return (
    <aside style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--color-surface)",
      borderRight: "1.5px solid var(--color-border)",
      overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 18px 14px", borderBottom: "1.5px solid var(--color-border)" }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          letterSpacing: "2px",
          color: "var(--color-accent)",
          lineHeight: 1,
        }}>
          LOCAL ASSISTANT
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 8,
        }}>
          <StatusDot status={ollamaStatus} />
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", letterSpacing: "0.5px", textTransform: "uppercase", fontWeight: 500 }}>
            {ollamaStatus === "running" ? "Ollama ready" :
             ollamaStatus === "starting" || ollamaStatus === "checking" ? "Connecting…" :
             "Ollama offline"}
          </span>
        </div>
      </div>

      {/* Active model chip */}
      {activeModel && (
        <div style={{ padding: "8px 18px", borderBottom: "1.5px solid var(--color-border)" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            border: "1.5px solid var(--color-border-2)",
            borderRadius: "var(--radius-pill)",
            background: "var(--color-surface-2)",
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", letterSpacing: "0.5px", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              {activeModel}
            </span>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* MCP section */}
        <div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button onClick={() => toggle("mcp")} style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              background: "none",
              border: "none",
              color: open === "mcp" ? "var(--color-text-primary)" : "var(--color-text-muted)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              fontFamily: "var(--font-sans)",
              transition: "color 0.15s",
            }}>
              {open === "mcp"
                ? <ChevronDown size={11} />
                : <ChevronRight size={11} />}
              MCP
            </button>
            <button
              onClick={mcpReload}
              disabled={mcpLoading}
              title="Reload MCP servers"
              style={{
                padding: "10px 12px",
                background: "none",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: mcpLoading ? "default" : "pointer",
                opacity: mcpLoading ? 0.4 : 1,
                transition: "color 0.15s, opacity 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (!mcpLoading) e.currentTarget.style.color = "var(--color-text-dim)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
            >
              <RefreshCw size={11} style={{ animation: mcpLoading ? "dot-pulse 1.4s ease-in-out infinite" : undefined }} />
            </button>
          </div>
          {open === "mcp" && <McpPanel />}
        </div>

        {/* Models section */}
        <div style={{ marginTop: 2 }}>
          <button onClick={() => toggle("models")} style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            background: "none",
            border: "none",
            color: open === "models" ? "var(--color-text-primary)" : "var(--color-text-muted)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            fontFamily: "var(--font-sans)",
            transition: "color 0.15s",
          }}>
            {open === "models"
              ? <ChevronDown size={11} />
              : <ChevronRight size={11} />}
            Models
          </button>
          {open === "models" && <ModelManager />}
        </div>

        {/* Cloud section */}
        <div style={{ marginTop: 2 }}>
          <button onClick={() => toggle("cloud")} style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            background: "none",
            border: "none",
            color: open === "cloud" ? "var(--color-text-primary)" : "var(--color-text-muted)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            fontFamily: "var(--font-sans)",
            transition: "color 0.15s",
          }}>
            {open === "cloud" ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Models:Cloud
          </button>
          {open === "cloud" && <CloudPanel />}
        </div>

        {/* Skills section */}
        <div style={{ marginTop: 2 }}>
          <button onClick={() => toggle("skills")} style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            background: "none",
            border: "none",
            color: open === "skills" ? "var(--color-text-primary)" : "var(--color-text-muted)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            fontFamily: "var(--font-sans)",
            transition: "color 0.15s",
          }}>
            {open === "skills"
              ? <ChevronDown size={11} />
              : <ChevronRight size={11} />}
            Skills
          </button>
          {open === "skills" && <SkillPanel />}
        </div>

        {/* Web Search section */}
        <div style={{ marginTop: 2 }}>
          <button onClick={() => toggle("search")} style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            background: "none",
            border: "none",
            color: open === "search" ? "var(--color-text-primary)" : "var(--color-text-muted)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            fontFamily: "var(--font-sans)",
            transition: "color 0.15s",
          }}>
            {open === "search" ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Web Search
          </button>
          {open === "search" && <SearchPanel />}
        </div>
      </div>

      <ContextUsageBar model={activeModel} />
    </aside>
  );
}
