import { useEffect, useRef, useState } from "react";
import { History, Plus } from "lucide-react";
import { listSessions } from "../../services/sessions";
import type { SessionMeta } from "../../types/session";

interface Props {
  currentSessionId: string;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function ChatHeader({ currentSessionId, onNewSession, onSwitchSession }: Props) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load session list whenever the panel opens
  useEffect(() => {
    if (!open) return;
    listSessions().then(setSessions).catch(() => setSessions([]));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSwitch = (id: string) => {
    setOpen(false);
    onSwitchSession(id);
  };

  const btnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    background: "none",
    border: "1.5px solid var(--color-border-2)",
    borderRadius: "var(--radius-sm)",
    color: "var(--color-text-muted)",
    fontSize: 11,
    fontFamily: "var(--font-sans)",
    fontWeight: 600,
    letterSpacing: "0.4px",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  };

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      {/* Header bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 6,
        padding: "6px 12px",
        borderBottom: "1px solid var(--color-border)",
      }}>
        <button
          style={btnStyle}
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-accent)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-2)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
          }}
        >
          <History size={11} />
          History
        </button>
        <button
          style={btnStyle}
          onClick={onNewSession}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-accent)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-2)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
          }}
        >
          <Plus size={11} />
          New Chat
        </button>
      </div>

      {/* History dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          right: 12,
          zIndex: 100,
          width: 280,
          background: "var(--color-surface)",
          border: "1.5px solid var(--color-border-2)",
          borderRadius: "var(--radius-sm)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}>
          {sessions.length === 0 ? (
            <p style={{ padding: "12px 14px", fontSize: 12, color: "var(--color-text-muted)" }}>
              No past sessions
            </p>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSwitch(s.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 14px",
                    background: isActive ? "var(--color-surface-2)" : "none",
                    border: "none",
                    borderBottom: "1px solid var(--color-border)",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "none";
                  }}
                >
                  <div style={{
                    fontSize: 12,
                    color: isActive ? "var(--color-accent)" : "var(--color-text-primary)",
                    fontWeight: isActive ? 600 : 400,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 2,
                  }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                    {relativeTime(s.updatedAt)} · {s.turnCount} {s.turnCount === 1 ? "message" : "messages"}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
