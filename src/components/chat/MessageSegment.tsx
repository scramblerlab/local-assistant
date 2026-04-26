import { useState } from "react";
import { ChevronDown, ChevronRight, Globe, Search } from "lucide-react";
import type { MessageSegment as Seg } from "../../types/chat";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Props {
  segment: Seg;
}

export function MessageSegment({ segment }: Props) {
  const [collapsed, setCollapsed] = useState(segment.kind === "thinking");

  if (segment.kind === "thinking") {
    return (
      <div style={{ marginBottom: 4 }}>
        <button onClick={() => setCollapsed((v) => !v)} style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", padding: "2px 0",
          color: "var(--color-text-muted)", fontSize: 11,
          fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase",
          fontFamily: "var(--font-sans)", transition: "color 0.15s",
          cursor: "pointer",
        }}>
          {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
          Reasoning
        </button>
        {!collapsed && (
          <div style={{
            marginTop: 4,
            paddingLeft: 12,
            borderLeft: "2px solid var(--color-border-2)",
            color: "#94a3b8",  /* text-dim — kept as designed */
            fontStyle: "italic",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}>
            {segment.content}
          </div>
        )}
      </div>
    );
  }

  if (segment.kind === "tool-use") {
    // content format: "web_search:query" or "web_fetch:url" or "done:web_search:query"
    const isDone = segment.content.startsWith("done:");
    const body = isDone ? segment.content.slice(5) : segment.content;
    const colonIdx = body.indexOf(":");
    const toolName = colonIdx >= 0 ? body.slice(0, colonIdx) : body;
    const arg = colonIdx >= 0 ? body.slice(colonIdx + 1) : "";
    const isSearch = toolName === "web_search";
    const Icon = isSearch ? Search : Globe;
    const label = isSearch ? `Searching: ${arg}` : `Fetching: ${arg}`;
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", marginBottom: 4,
        background: "var(--color-accent-dim)",
        border: "1.5px solid var(--color-accent)",
        borderRadius: "var(--radius-pill)",
        fontSize: 11, color: "var(--color-accent)",
        fontWeight: 600, letterSpacing: "0.5px",
        animation: isDone ? undefined : "dot-pulse 1.4s ease-in-out infinite",
        opacity: isDone ? 0.6 : 1,
      }}>
        <Icon size={11} />
        {label}
      </div>
    );
  }

  if (segment.kind === "quoted") {
    return (
      <div style={{
        marginBottom: 4,
        paddingLeft: 12,
        borderLeft: "2px solid #eab308",  /* yellow-500 — kept as designed */
        color: "#fde047",                  /* yellow-300 — kept as designed */
        fontSize: 13,
      }}>
        <MarkdownRenderer content={segment.content} />
      </div>
    );
  }

  // final — white, kept as designed
  return (
    <div style={{ color: "#f1f5f9", fontSize: 14, lineHeight: 1.65 }}>
      <MarkdownRenderer content={segment.content} />
    </div>
  );
}
