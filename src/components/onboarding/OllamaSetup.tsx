import { invoke } from "@tauri-apps/api/core";
import type { OllamaStatus } from "../../hooks/useOllamaHealth";

interface Props {
  status: OllamaStatus;
  onRetry: () => void;
  onStart: () => void;
}

const btnPrimary: React.CSSProperties = {
  padding: "10px 24px",
  background: "var(--color-accent)",
  border: "1.5px solid var(--color-accent)",
  borderRadius: "var(--radius-pill)",
  color: "#0a0a0f",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "1px",
  textTransform: "uppercase",
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 24px",
  background: "transparent",
  border: "1.5px solid var(--color-border-2)",
  borderRadius: "var(--radius-pill)",
  color: "var(--color-text-muted)",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "1px",
  textTransform: "uppercase",
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  transition: "border-color 0.15s, color 0.15s",
};

export function OllamaSetup({ status, onRetry, onStart }: Props) {
  const openDownload = () => invoke("open_ollama_download");

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 20,
      padding: 40,
      textAlign: "center",
    }}>
      <div style={{
        fontFamily: "var(--font-display)",
        fontSize: 52,
        letterSpacing: "3px",
        color: "var(--color-accent)",
        lineHeight: 1,
      }}>
        GENERATIVE ASSISTANT
      </div>

      {status === "not_installed" && (
        <>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", maxWidth: 360, lineHeight: 1.6 }}>
            Ollama is required to run local LLMs. Install it to get started.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={btnPrimary} onClick={openDownload}>Download Ollama</button>
            <button style={btnSecondary} onClick={onRetry}>I've Installed It</button>
          </div>
        </>
      )}

      {status === "starting" && (
        <>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>Starting Ollama server…</p>
          <div style={{
            width: 28, height: 28,
            border: "2.5px solid var(--color-border-2)",
            borderTopColor: "var(--color-accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
        </>
      )}

      {status === "checking" && (
        <>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>Connecting to Ollama…</p>
          <div style={{
            width: 28, height: 28,
            border: "2.5px solid var(--color-border-2)",
            borderTopColor: "var(--color-accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
        </>
      )}

      {status === "not_running" && (
        <>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", maxWidth: 360, lineHeight: 1.6 }}>
            Ollama is installed but not responding.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={btnPrimary} onClick={onStart}>Start Ollama</button>
            <button style={btnSecondary} onClick={onRetry}>Retry</button>
          </div>
        </>
      )}
    </div>
  );
}
