import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Turn } from "../../types/chat";
import { MessageSegment } from "./MessageSegment";

interface Props {
  turn: Turn;
}

// Compact divider — shown where old turns were replaced by a summary
function CompactDivider() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      margin: "16px 0",
    }}>
      <div style={{ flex: 1, height: "1px", background: "var(--color-border-2)" }} />
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: "var(--color-accent)",
        background: "var(--color-accent-dim)",
        border: "1.5px solid var(--color-accent)",
        borderRadius: "var(--radius-pill)",
        padding: "2px 10px",
        whiteSpace: "nowrap",
      }}>
        Context compacted
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--color-border-2)" }} />
    </div>
  );
}

export function ResponseGroup({ turn }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (turn.isCompact) return <CompactDivider />;

  return (
    <div style={{ marginBottom: 20, animation: "fade-in 0.2s ease" }}>
      {/* User message — right-aligned bubble */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <div style={{
          background: "var(--color-surface-2)",
          border: "1.5px solid var(--color-border-2)",
          borderRadius: "var(--radius) var(--radius) 4px var(--radius)",
          padding: "10px 14px",
          maxWidth: "75%",
          fontSize: 14,
          color: "var(--color-text-primary)",
          lineHeight: 1.5,
        }}>
          {turn.userMessage}
        </div>
      </div>

      {/* Assistant response */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--color-accent-dim)",
          border: "1.5px solid var(--color-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontFamily: "var(--font-display)",
          fontSize: 13, color: "var(--color-accent)", letterSpacing: "1px",
        }}>
          AI
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <button onClick={() => setCollapsed((v) => !v)} style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "none", border: "none", padding: 0,
              color: "var(--color-text-muted)", fontSize: 11,
              fontFamily: "var(--font-sans)", letterSpacing: "0.5px",
              textTransform: "uppercase", fontWeight: 500,
              cursor: "pointer", transition: "color 0.15s",
            }}>
              {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              {turn.model}
            </button>
            {turn.isStreaming && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--color-accent)",
                animation: "dot-pulse 1.4s ease-in-out infinite",
              }} />
            )}
          </div>

          {!collapsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(() => {
                const doneKeys = new Set(
                  turn.segments
                    .filter((s) => s.kind === "tool-use" && s.content.startsWith("done:"))
                    .map((s) => s.content.slice(5))
                );
                return turn.segments
                  .filter((s) => !(s.kind === "tool-use" && !s.content.startsWith("done:") && doneKeys.has(s.content)))
                  .map((seg) => <MessageSegment key={seg.id} segment={seg} />);
              })()}
              {turn.isStreaming && turn.segments.length === 0 && (
                <span style={{ fontSize: 13, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                  Thinking…
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
