import { useState, useEffect, useRef } from "react";
import { usePermissionStore } from "../../stores/permissionStore";

export function FilePermissionDialog() {
  const pending = usePermissionStore((s) => s.pending);
  const grantPermission = usePermissionStore((s) => s.grantPermission);
  const denyPermission = usePermissionStore((s) => s.denyPermission);
  const [step, setStep] = useState(0);
  // Track when the dialog became interactive (set after browser paints via useEffect).
  // Any click whose timeStamp predates this was fired before the dialog appeared —
  // discard it to prevent click bleed-through from the chat Send button.
  const readyAtRef = useRef(0);

  useEffect(() => {
    if (pending) {
      readyAtRef.current = performance.now();
      console.log("[FilePermissionDialog] dialog ready for path:", pending.path);
    }
  }, [pending]);

  if (!pending) return null;

  const { path, operation, isOutsideHome } = pending;
  const needsSecondConfirm = isOutsideHome && step === 0;

  const handleGrant = async (e: React.MouseEvent) => {
    if (e.timeStamp < readyAtRef.current) {
      console.warn("[FilePermissionDialog] discarding stale Allow click (bleed-through)");
      return;
    }
    if (needsSecondConfirm) {
      setStep(1);
      return;
    }
    setStep(0);
    await grantPermission();
  };

  const handleDeny = (e: React.MouseEvent) => {
    if (e.timeStamp < readyAtRef.current) {
      console.warn("[FilePermissionDialog] discarding stale Deny click (bleed-through)");
      return;
    }
    setStep(0);
    denyPermission();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--color-surface)",
          border: "1.5px solid var(--color-border-2)",
          borderRadius: "var(--radius)",
          padding: "24px 28px",
          maxWidth: 480,
          width: "90%",
          boxShadow: "var(--shadow)",
        }}
      >
        {isOutsideHome && (
          <div
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1.5px solid #ef4444",
              borderRadius: "var(--radius-sm)",
              padding: "8px 12px",
              marginBottom: 16,
              fontSize: 12,
              color: "#ef4444",
              lineHeight: 1.5,
            }}
          >
            {step === 0
              ? "This path is outside your home directory."
              : "Second confirmation required. This access will NOT be saved to your permission list and will need to be re-approved next time."}
          </div>
        )}

        <h3
          style={{
            margin: "0 0 8px",
            fontSize: 15,
            color: "var(--color-text-primary)",
            fontWeight: 600,
          }}
        >
          {needsSecondConfirm ? "Confirm Again" : "Permission Request"}
        </h3>

        <p
          style={{
            margin: "0 0 12px",
            fontSize: 13,
            color: "var(--color-text-dim)",
            lineHeight: 1.5,
          }}
        >
          The AI wants to <strong>{operation}</strong>:
        </p>

        <code
          style={{
            display: "block",
            background: "var(--color-surface-2)",
            border: "1.5px solid var(--color-border-2)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--color-accent)",
            wordBreak: "break-all",
            marginBottom: 20,
          }}
        >
          {path}
        </code>

        {!isOutsideHome && (
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 12,
              color: "var(--color-text-muted, var(--color-text-dim))",
              lineHeight: 1.5,
            }}
          >
            Approving grants access to this folder and all its subfolders. This
            choice is saved and won't be asked again.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={handleDeny}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--radius-sm)",
              background: "transparent",
              border: "1.5px solid var(--color-border-2)",
              color: "var(--color-text-dim)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Deny
          </button>
          <button
            onClick={handleGrant}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--radius-sm)",
              background: isOutsideHome ? "#ef4444" : "var(--color-accent)",
              border: "none",
              color: isOutsideHome ? "#fff" : "#0a0a0f",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {needsSecondConfirm ? "I understand, allow once" : "Allow"}
          </button>
        </div>
      </div>
    </div>
  );
}
