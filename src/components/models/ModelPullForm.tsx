import { useState, useRef } from "react";
import { X } from "lucide-react";
import { pullStream } from "../../services/ollama";
import { useQueryClient } from "@tanstack/react-query";

export function ModelPullForm() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "pulling" | "done" | "error">("idle");
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
      for await (const chunk of pullStream(name.trim(), ac.signal)) {
        setStatusText(chunk.status);
        if (chunk.total && chunk.completed) setProgress(Math.round((chunk.completed / chunk.total) * 100));
        if (chunk.status === "success") {
          setStatus("done");
          setProgress(100);
          qc.invalidateQueries({ queryKey: ["models"] });
          setTimeout(() => { setStatus("idle"); setName(""); setProgress(0); }, 2000);
          return;
        }
      }
      setStatus("done");
      qc.invalidateQueries({ queryKey: ["models"] });
    } catch (e) {
      if ((e as Error).name !== "AbortError") { setStatus("error"); setStatusText("Pull failed"); }
      else setStatus("idle");
    }
  };

  const cancel = () => { abortRef.current?.abort(); setStatus("idle"); setProgress(0); };

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
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase" as const,
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
              width: `${progress}%`,
              height: 3,
              background: "var(--color-accent)",
              borderRadius: "var(--radius-pill)",
              transition: "width 0.3s",
            }} />
          </div>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{statusText}</p>
        </div>
      )}
      {status === "done" && <p style={{ fontSize: 11, color: "var(--color-green)", marginTop: 6 }}>Downloaded!</p>}
      {status === "error" && <p style={{ fontSize: 11, color: "var(--color-red)", marginTop: 6 }}>{statusText}</p>}
    </div>
  );
}
