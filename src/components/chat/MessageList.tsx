import { useEffect, useRef } from "react";
import type { Turn } from "../../types/chat";
import { ResponseGroup } from "./ResponseGroup";

interface Props {
  turns: Turn[];
}

export function MessageList({ turns }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px 32px",
      }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 42,
          letterSpacing: "3px",
          color: "var(--color-accent)",
          marginBottom: 8,
          lineHeight: 1,
        }}>
          GENERATIVE ASSISTANT
        </div>
        <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          maxWidth: 320,
          lineHeight: 1.6,
          fontWeight: 500,
          letterSpacing: "0.3px",
        }}>
          Running locally. Start a conversation below.<br />
          Toggle skills in the sidebar to extend capabilities.
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px" }}>
      {turns.map((turn) => (
        <ResponseGroup key={turn.id} turn={turn} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
