import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../stores/settingsStore";
import { useMcpStore } from "../../stores/mcpStore";

interface ApiKeyRowProps {
  label: string;
  description: string;
  linkHref: string;
  linkLabel: string;
  value: string;
  onSave: (key: string) => Promise<void>;
}

function ApiKeyRow({ label, description, linkHref, linkLabel, value, onSave }: ApiKeyRowProps) {
  const [localValue, setLocalValue] = useState(value);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localValue);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = localValue.trim() !== value;

  return (
    <div style={{ padding: "8px 18px 10px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-dim)" }}>
          {label}
        </span>
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: "var(--color-accent)", textDecoration: "none" }}
        >
          {linkLabel} ↗
        </a>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type={show ? "text" : "password"}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="Paste your key here"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "var(--color-surface-2)",
              border: "1.5px solid var(--color-border-2)",
              borderRadius: "var(--radius-sm)",
              padding: "5px 30px 5px 8px",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-dim)",
              outline: "none",
            }}
          />
          <button
            onClick={() => setShow((v) => !v)}
            title={show ? "Hide key" : "Show key"}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-text-muted)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {show ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "5px 12px",
            background: saved ? "var(--color-green, #22c55e)" : "var(--color-accent)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            color: "#000",
            fontSize: 11,
            fontWeight: 700,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
            flexShrink: 0,
            transition: "background 0.2s",
            minWidth: 52,
          }}
        >
          {saved ? "✓ Saved" : isDirty ? "Save" : "Save"}
        </button>
      </div>

      <div style={{ marginTop: 5, fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
        {description}
      </div>
    </div>
  );
}

// --- Gmail Row ---

interface GmailAccount {
  email: string;
  is_active: boolean;
}

function GmailRow() {
  const [accounts, setAccounts] = useState<GmailAccount[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async () => {
    try {
      const accts = await invoke<GmailAccount[]>("gmail_list_accounts");
      setAccounts(accts);
      if (accts.some((a) => a.is_active)) {
        await invoke("gmail_ensure_config").catch(() => {});
        await useMcpStore.getState().reload();
      }
    } catch {
      setAccounts([]);
    }
  };

  useEffect(() => { loadAccounts(); }, []);

  const runAddAccount = async (email: string) => {
    setConnecting(true);
    setShowEmailPrompt(false);
    setError(null);
    try {
      await invoke("gmail_add_account", { email });
      setEmailInput("");
      await loadAccounts();
      await useMcpStore.getState().reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setConnecting(false);
    }
  };

  const handleAddClick = () => {
    setError(null);
    setEmailInput("");
    setShowEmailPrompt(true);
  };

  const handleSwitch = async (email: string) => {
    setError(null);
    try {
      await invoke("gmail_switch_account", { email });
      await loadAccounts();
      await useMcpStore.getState().reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = async (email: string) => {
    setError(null);
    try {
      await invoke("gmail_remove_account", { email });
      await loadAccounts();
      await useMcpStore.getState().reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const isLoading = accounts === null;
  const hasAccounts = (accounts?.length ?? 0) > 0;

  return (
    <div style={{ padding: "8px 18px 10px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-dim)" }}>Gmail</span>
          {!isLoading && !connecting && (
            <button
              onClick={handleAddClick}
              style={{
                padding: "3px 10px",
                background: hasAccounts ? "var(--color-surface-2)" : "var(--color-accent)",
                border: hasAccounts ? "1.5px solid var(--color-border-2)" : "none",
                borderRadius: "var(--radius-sm)",
                color: hasAccounts ? "var(--color-text-dim)" : "#000",
                fontSize: 10, fontWeight: 700, cursor: "pointer",
              }}
            >
              {hasAccounts ? "+ Add Account" : "Set up & Connect"}
            </button>
          )}
        </div>

        {/* Email prompt (when keys exist, skip wizard) */}
        {showEmailPrompt && !connecting && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input
              type="email"
              placeholder="you@gmail.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && emailInput.includes("@")) runAddAccount(emailInput.trim()); }}
              autoFocus
              style={{
                flex: 1,
                background: "var(--color-surface-2)",
                border: "1.5px solid var(--color-border-2)",
                borderRadius: "var(--radius-sm)",
                padding: "5px 8px",
                fontSize: 11, fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim)", outline: "none",
              }}
            />
            <button
              onClick={() => runAddAccount(emailInput.trim())}
              disabled={!emailInput.includes("@")}
              style={{
                padding: "5px 10px", flexShrink: 0,
                background: "var(--color-accent)", border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#000", fontSize: 10, fontWeight: 700,
                cursor: emailInput.includes("@") ? "pointer" : "default",
                opacity: emailInput.includes("@") ? 1 : 0.4,
              }}
            >
              Connect
            </button>
            <button
              onClick={() => setShowEmailPrompt(false)}
              style={{
                padding: "5px 8px", flexShrink: 0,
                background: "none", border: "1.5px solid var(--color-border-2)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-muted)", fontSize: 10, cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Body */}
        {isLoading ? (
          <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Loading…</div>
        ) : connecting ? (
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontStyle: "italic" }}>
            Waiting for browser sign-in…
          </div>
        ) : hasAccounts ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {accounts!.map((acct) => (
              <div
                key={acct.email}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 8px",
                  background: acct.is_active ? "rgba(234,179,8,0.07)" : "transparent",
                  border: `1px solid ${acct.is_active ? "rgba(234,179,8,0.2)" : "transparent"}`,
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <span style={{ fontSize: 10, color: acct.is_active ? "var(--color-accent)" : "var(--color-text-muted)", flexShrink: 0 }}>
                  {acct.is_active ? "●" : "○"}
                </span>
                <span style={{
                  fontSize: 11, fontFamily: "var(--font-mono)", flex: 1,
                  color: acct.is_active ? "var(--color-text-dim)" : "var(--color-text-muted)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {acct.email}
                </span>
                {acct.is_active && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-accent)", letterSpacing: "0.4px", flexShrink: 0 }}>
                    ACTIVE
                  </span>
                )}
                {!acct.is_active && (
                  <button
                    onClick={() => handleSwitch(acct.email)}
                    style={{
                      padding: "2px 7px", flexShrink: 0,
                      background: "var(--color-accent)", border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: "#000", fontSize: 9, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    Switch
                  </button>
                )}
                <button
                  onClick={() => handleRemove(acct.email)}
                  style={{
                    padding: "2px 7px", flexShrink: 0,
                    background: "none", border: "1.5px solid var(--color-border-2)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text-muted)", fontSize: 9, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            No accounts connected. Credentials are stored locally and never leave your device.
          </div>
        )}

        {error && (
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--color-red, #ef4444)", lineHeight: 1.4 }}>
            {error}
          </div>
        )}
      </div>
  );
}

export function SettingsPanel() {
  const { ollamaApiKey, braveApiKey, setOllamaApiKey, setBraveApiKey } = useSettingsStore();

  return (
    <div style={{ paddingBottom: 8 }}>
      <div style={{
        padding: "4px 18px 6px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
      }}>
        API Keys
      </div>

      <ApiKeyRow
        label="Ollama Cloud"
        description="Required for cloud models and Ollama web search."
        linkHref="https://ollama.com/settings/keys"
        linkLabel="Get a key"
        value={ollamaApiKey}
        onSave={setOllamaApiKey}
      />

      <ApiKeyRow
        label="Brave Search"
        description="Required for Brave web search provider."
        linkHref="https://brave.com/search/api/"
        linkLabel="Get a free key"
        value={braveApiKey}
        onSave={setBraveApiKey}
      />

      <div style={{
        padding: "4px 18px 6px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        marginTop: 6,
      }}>
        Integrations
      </div>

      <GmailRow />
    </div>
  );
}
