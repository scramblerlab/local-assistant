import { useState, useRef, useCallback, KeyboardEvent, ClipboardEvent } from "react";
import { Send, Square, Paperclip, X } from "lucide-react";
import { usePromptHistory } from "../../hooks/usePromptHistory";

interface Props {
  onSend: (text: string, images: string[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  isCompacting?: boolean;
  disabled?: boolean;
  supportsVision?: boolean;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip "data:image/...;base64," prefix
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function InputBar({ onSend, onStop, isStreaming, isCompacting, disabled, supportsVision }: Props) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const justFinishedComposing = useRef(false);
  const { push, up, down } = usePromptHistory();

  const addImages = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const encoded = await Promise.all(imageFiles.map(readFileAsBase64));
    setImages((prev) => [...prev, ...encoded]);
  }, []);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || isCompacting) return;
    push(trimmed);
    onSend(trimmed, images);
    setValue("");
    setImages([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [value, images, isStreaming, isCompacting, push, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (composing.current || justFinishedComposing.current || e.nativeEvent.isComposing) {
        justFinishedComposing.current = false;
        return;
      }
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "ArrowUp" && !e.shiftKey) {
      const sel = textareaRef.current;
      if (sel && sel.selectionStart === 0) { e.preventDefault(); setValue(up(value)); }
      return;
    }
    if (e.key === "ArrowDown" && !e.shiftKey) {
      const sel = textareaRef.current;
      if (sel && sel.selectionStart === sel.value.length) { e.preventDefault(); setValue(down()); }
      return;
    }
    if (e.key === "Escape") setValue("");
  };

  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  };

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!supportsVision) return;
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[];
    addImages(files);
  }, [supportsVision, addImages]);

  const canSend = (value.trim() || images.length > 0) && !disabled;

  return (
    <div style={{ borderTop: "1.5px solid var(--color-border)", background: "var(--color-surface)", padding: "14px 16px 12px" }}>
      {/* Thumbnail strip */}
      {images.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: "relative", flexShrink: 0 }}>
              <img
                src={`data:image/jpeg;base64,${img}`}
                alt=""
                style={{ height: 64, width: "auto", maxWidth: 100, borderRadius: 6, objectFit: "cover", border: "1.5px solid var(--color-border-2)", display: "block" }}
              />
              <button
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                style={{
                  position: "absolute", top: -6, right: -6,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "var(--color-surface)", border: "1.5px solid var(--color-border-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", padding: 0,
                }}
              >
                <X size={9} color="var(--color-text-muted)" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 10,
        background: "var(--color-surface-2)",
        border: "1.5px solid var(--color-border-2)",
        borderRadius: "var(--radius)",
        padding: "10px 12px",
        transition: "border-color 0.15s",
      }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-border-2)")}
      >
        {supportsVision && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) addImages(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
              style={{
                background: "none", border: "none", padding: 2, flexShrink: 0,
                color: "var(--color-text-muted)", cursor: "pointer",
                display: "flex", alignItems: "center",
                transition: "color 0.15s",
              }}
            >
              <Paperclip size={15} />
            </button>
          </>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); handleInput(); }}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => {
            composing.current = false;
            justFinishedComposing.current = true;
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            disabled ? "Ollama not connected…" :
            isCompacting ? "Compacting context…" :
            "Message…  (↑ history · /compact)"
          }
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--color-text-primary)",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            fontWeight: 400,
            lineHeight: 1.5,
            resize: "none",
            padding: "2px 0",
            minHeight: 24,
            maxHeight: 200,
            overflowY: "auto",
          }}
        />
        {isStreaming ? (
          <button onClick={onStop} style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "var(--color-red)", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "opacity 0.15s",
          }}>
            <Square size={13} color="#fff" />
          </button>
        ) : (
          <button onClick={submit} disabled={!canSend} style={{
            width: 32, height: 32, borderRadius: "50%",
            background: canSend ? "var(--color-accent)" : "var(--color-surface-2)",
            border: "1.5px solid " + (canSend ? "var(--color-accent)" : "var(--color-border-2)"),
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "background 0.15s, border-color 0.15s",
          }}>
            <Send size={13} color={canSend ? "#0a0a0f" : "var(--color-text-muted)"} />
          </button>
        )}
      </div>
      {/* /compact autocomplete hint */}
      {value.startsWith("/") && !isStreaming && (
        <div style={{
          marginTop: 6, padding: "6px 10px",
          background: "var(--color-surface-2)",
          border: "1.5px solid var(--color-border-2)",
          borderRadius: "var(--radius-sm)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-accent)", fontWeight: 600 }}>/compact</span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Summarise older turns to free up context</span>
        </div>
      )}
      {isCompacting && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <div style={{
            width: 12, height: 12,
            border: "2px solid var(--color-border-2)",
            borderTopColor: "var(--color-accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, color: "var(--color-accent)", letterSpacing: "0.5px", textTransform: "uppercase", fontWeight: 600 }}>
            Compacting context…
          </span>
        </div>
      )}
      {!value.startsWith("/") && !isCompacting && (
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-muted)", marginTop: 8, letterSpacing: "0.3px" }}>
          Enter to send · Shift+Enter for newline · ↑↓ history
        </p>
      )}
    </div>
  );
}
