import { useState, useCallback, useRef } from "react";
import type { OllamaStatus } from "../../hooks/useOllamaHealth";
import { Sidebar } from "./Sidebar";
import { ChatView } from "../chat/ChatView";
import { OllamaSetup } from "../onboarding/OllamaSetup";
import { useActiveModel } from "../../hooks/useModels";

interface Props {
  ollamaStatus: OllamaStatus;
  onRetry: () => void;
  onStart: () => void;
}

const MIN_WIDTH = 140;
const MAX_WIDTH = 480;

export function AppShell({ ollamaStatus, onRetry, onStart }: Props) {
  const { activeModel } = useActiveModel();
  const ollamaReady = ollamaStatus === "running";

  const [sidebarWidth, setSidebarWidth] = useState(220);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + ev.clientX - startX.current));
      setSidebarWidth(next);
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--color-bg)" }}>
      <div style={{ width: sidebarWidth, flexShrink: 0 }}>
        <Sidebar ollamaStatus={ollamaStatus} />
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          width: 4,
          flexShrink: 0,
          background: "var(--color-border)",
          cursor: "col-resize",
          transition: "background 0.15s",
          position: "relative",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-border)")}
      />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }}>
        {ollamaReady ? (
          <ChatView model={activeModel} ollamaReady={ollamaReady} />
        ) : (
          <OllamaSetup status={ollamaStatus} onRetry={onRetry} onStart={onStart} />
        )}
      </main>
    </div>
  );
}
