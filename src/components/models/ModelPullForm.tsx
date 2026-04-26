import { useState, useRef } from "react";
import { X, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { pullStream } from "../../services/ollama";
import { useQueryClient } from "@tanstack/react-query";

function isOllamaOutdatedError(msg: string) {
  return msg.includes("412") || msg.includes("newer version of Ollama");
}

function OllamaUpgradePrompt({ onDone }: { onDone: () => void }) {
  const [upgrading, setUpgrading] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [detail, setDetail] = useState("");

  const upgrade = async () => {
    setUpgrading("running");
    setDetail("");
    try {
      const version = await invoke<string>("upgrade_ollama");
      setUpgrading("done");
      setDetail(`Ollama updated and restarted (${version}). You can retry the download now.`);
    } catch (e) {
      setUpgrading("failed");
      setDetail((e as Error).message);
      invoke("open_ollama_download").catch(() => {});
    }
  };

  return (
    <div style={{
      marginTop: 8,
      padding: "10px 12px",
      background: "var(--color-surface-2)",
      border: "1.5px solid var(--color-accent)",
      borderRadius: "var(--radius-sm)",
    }}>
      <p style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 600, marginBottom: 4 }}>
        Ollama update required
      </p>
      <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
        This model needs a newer version of Ollama.
      </p>
      {upgrading === "idle" && (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={upgrade}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px",
              background: "var(--color-accent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#0a0a0f",
              fontSize: 11, fontWeight: 700,
              letterSpacing: "0.5px", textTransform: "uppercase",
              fontFamily: "var(--font-sans)",
            }}
          >
            <RefreshCw size={11} />
            Update Ollama
          </button>
          <button
            onClick={onDone}
            style={{
              padding: "5px 10px",
              background: "none",
              border: "1.5px solid var(--color-border-2)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text-muted)",
              fontSize: 11,
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {upgrading === "running" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 11, height: 11,
            border: "2px solid var(--color-border-2)",
            borderTopColor: "var(--color-accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Updating via Homebrew…</span>
        </div>
      )}
      {(upgrading === "done" || upgrading === "failed") && (
        <div>
          <p style={{
            fontSize: 11,
            color: upgrading === "done" ? "var(--color-green)" : "var(--color-red)",
            lineHeight: 1.5,
            marginBottom: 6,
          }}>
            {detail}
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            {upgrading === "done" && (
              <button
                onClick={onDone}
                style={{
                  padding: "4px 12px",
                  background: "var(--color-accent)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  color: "#0a0a0f",
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.5px", textTransform: "uppercase",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Retry download
              </button>
            )}
            <button
              onClick={onDone}
              style={{
                padding: "4px 10px",
                background: "none",
                border: "1.5px solid var(--color-border-2)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-muted)",
                fontSize: 11,
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ModelPullForm() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "pulling" | "done" | "error" | "outdated">("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  const pull = async () => {
    if (!name.trim() || status === "pulling") return;
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus("pulling");
    setProgress(0);
    setStatusText("Starting…");
    try {
      let succeeded = false;
      for await (const chunk of pullStream(name.trim(), ac.signal)) {
        console.log("[pull chunk]", chunk);
        if (chunk.error) {
          console.error("[pull error]", chunk.error);
          if (isOllamaOutdatedError(chunk.error)) {
            setStatus("outdated");
          } else {
            setStatus("error");
            setStatusText(chunk.error);
          }
          return;
        }
        if (chunk.status) setStatusText(chunk.status);
        if (chunk.total && chunk.completed) setProgress(Math.round((chunk.completed / chunk.total) * 100));
        if (chunk.status === "success") {
          succeeded = true;
          setStatus("done");
          setProgress(100);
          qc.invalidateQueries({ queryKey: ["models"] });
          setTimeout(() => { setStatus("idle"); setName(""); setProgress(0); }, 2000);
          return;
        }
      }
      if (!succeeded) {
        setStatus("error");
        setStatusText("Pull ended without confirmation — check model name");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const msg = (e as Error).message;
        console.error("[pull exception]", msg);
        if (isOllamaOutdatedError(msg)) {
          setStatus("outdated");
        } else {
          setStatus("error");
          setStatusText(msg);
        }
      } else {
        setStatus("idle");
      }
    }
  };

  const cancel = () => { abortRef.current?.abort(); setStatus("idle"); setProgress(0); };
  const dismiss = () => { setStatus("idle"); setProgress(0); };

  return (
    <div style={{ padding: "0 12px 10px" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pull()}
          placeholder="llama3.2:3b"
          disabled={status === "pulling"}
          style={{
            flex: 1,
            background: "var(--color-surface-2)",
            border: "1.5px solid var(--color-border-2)",
            borderRadius: "var(--radius-sm)",
            padding: "5px 9px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-primary)",
            outline: "none",
            transition: "border-color 0.15s",
          }}
        />
        {status === "pulling" ? (
          <button onClick={cancel} style={{
            background: "none", border: "none", color: "var(--color-text-muted)",
            display: "flex", alignItems: "center", padding: "0 4px",
          }}>
            <X size={13} />
          </button>
        ) : (
          <button onClick={pull} disabled={!name.trim()} style={{
            padding: "5px 12px",
            background: name.trim() ? "var(--color-accent)" : "var(--color-surface-2)",
            border: "1.5px solid " + (name.trim() ? "var(--color-accent)" : "var(--color-border-2)"),
            borderRadius: "var(--radius-sm)",
            color: name.trim() ? "#0a0a0f" : "var(--color-text-muted)",
            fontSize: 11, fontWeight: 700,
            letterSpacing: "0.5px", textTransform: "uppercase" as const,
            fontFamily: "var(--font-sans)",
            transition: "all 0.15s",
          }}>
            Pull
          </button>
        )}
      </div>

      {status === "pulling" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ background: "var(--color-surface-2)", borderRadius: "var(--radius-pill)", height: 3 }}>
            <div style={{
              width: `${progress}%`, height: 3,
              background: "var(--color-accent)",
              borderRadius: "var(--radius-pill)",
              transition: "width 0.3s",
            }} />
          </div>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {statusText}
          </p>
        </div>
      )}
      {status === "done" && (
        <p style={{ fontSize: 11, color: "var(--color-green)", marginTop: 6 }}>Downloaded!</p>
      )}
      {status === "error" && (
        <p style={{ fontSize: 11, color: "var(--color-red)", marginTop: 6, lineHeight: 1.5 }}>{statusText}</p>
      )}
      {status === "outdated" && (
        <OllamaUpgradePrompt onDone={dismiss} />
      )}
    </div>
  );
}
