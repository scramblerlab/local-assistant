import { useMcpStore } from "../../stores/mcpStore";

export function McpPanel() {
  const { servers, loading } = useMcpStore();

  if (!loading && servers.length === 0) {
    return (
      <p style={{ padding: "6px 18px", fontSize: 12, color: "var(--color-text-muted)" }}>
        No MCP servers configured
      </p>
    );
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      {servers.map((server) => (
        <div key={server.id} style={{ padding: "7px 12px" }}>
          {/* Server row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: loading ? "var(--color-accent)" : "var(--color-green)",
              animation: loading ? "dot-pulse 1.4s ease-in-out infinite" : undefined,
              transition: "background 0.3s",
            }} />
            <span style={{
              fontSize: 12, fontWeight: 600, letterSpacing: "0.3px",
              color: "var(--color-text-dim)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {server.id}
            </span>
          </div>

          {/* Tool pills */}
          {server.tools.length > 0 && (
            <div style={{ paddingLeft: 12, marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {server.tools.map((tool) => (
                <span key={tool.name} style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 7px",
                  background: "var(--color-surface-2)",
                  border: "1.5px solid var(--color-border-2)",
                  borderRadius: "var(--radius-pill)",
                  fontSize: 10, fontWeight: 600,
                  color: "var(--color-text-dim)",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                }}>
                  {tool.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {loading && servers.length === 0 && (
        <p style={{ padding: "4px 18px", fontSize: 12, color: "var(--color-text-muted)" }}>
          Connecting…
        </p>
      )}
    </div>
  );
}
