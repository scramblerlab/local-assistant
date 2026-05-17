import { useRef, useState, useEffect } from "react";
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

// --- Gmail Setup Wizard ---

const STEPS = [
  {
    title: "Set up your Google Cloud project",
    body: "Open each link below in order and complete the step before moving on.",
    links: [
      { label: "① Create a project", href: "https://console.cloud.google.com/projectcreate", hint: "Fill in a project name and click Create." },
      { label: "② Enable Gmail API", href: "https://console.cloud.google.com/apis/library/gmail.googleapis.com", hint: "Click the blue Enable button." },
      { label: "③ Branding — fill in app name", href: "https://console.cloud.google.com/auth/branding", hint: "Enter any name (e.g. \"My Assistant\") and save. User Type should be External." },
      { label: "④ Audience — add yourself as test user", href: "https://console.cloud.google.com/auth/audience", hint: "Scroll to \"Test users\", click Add users, enter your Gmail address, and save. Required — Google will block sign-in without this." },
    ],
    note: null,
  },
  {
    title: "Create OAuth credentials",
    body: null,
    links: [
      { label: "Open Clients page", href: "https://console.cloud.google.com/auth/clients", hint: "Click Create client → Desktop app → give it any name → Create → Download JSON." },
    ],
    note: null,
  },
  {
    title: "Import credentials file",
    body: "Select the JSON file you downloaded. It will be saved automatically.",
    links: [],
    note: null,
  },
];

function GmailSetupWizard({ onComplete, onClose }: { onComplete: (email: string) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [keysContent, setKeysContent] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setKeysContent(ev.target?.result as string ?? null);
    reader.readAsText(file);
  };

  const canFinish = !!keysContent && email.trim().includes("@");

  const handleSaveAndConnect = async () => {
    if (!canFinish) return;
    setSaving(true);
    setError(null);
    try {
      await invoke("gmail_save_keys", { content: keysContent });
      onComplete(email.trim());
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const current = STEPS[step];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--color-surface)",
        border: "1.5px solid var(--color-border-2)",
        borderRadius: 10,
        width: 400, maxWidth: "90vw",
        padding: "22px 24px 20px",
        boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-dim)" }}>
            Set up Gmail
          </span>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--color-text-muted)", fontSize: 18, lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: step >= i ? "var(--color-accent)" : "var(--color-surface-2)",
                border: `1.5px solid ${step >= i ? "var(--color-accent)" : "var(--color-border-2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700,
                color: step >= i ? "#000" : "var(--color-text-muted)",
                flexShrink: 0,
              }}>
                {step > i ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 28, height: 1.5, background: step > i ? "var(--color-accent)" : "var(--color-border-2)" }} />
              )}
            </div>
          ))}
          <span style={{ marginLeft: 6, fontSize: 10, color: "var(--color-text-muted)" }}>
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        {/* Step title */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-dim)", marginBottom: 8 }}>
          {current.title}
        </div>

        {/* Step body */}
        {step === 0 && (
          <>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
              {current.body}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {current.links.map((l) => (
                <div key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" style={{
                    display: "block", padding: "7px 12px",
                    background: "var(--color-surface-2)",
                    border: "1.5px solid var(--color-border-2)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 11, fontWeight: 600,
                    color: "var(--color-accent)", textDecoration: "none",
                  }}>
                    {l.label} ↗
                  </a>
                  {"hint" in l && l.hint && (
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)", padding: "3px 4px 0", lineHeight: 1.5 }}>
                      {l.hint}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <ol style={{
              fontSize: 11, color: "var(--color-text-muted)",
              lineHeight: 1.8, paddingLeft: 18, margin: "0 0 14px",
            }}>
              <li>Go to <strong style={{ color: "var(--color-text-dim)" }}>APIs &amp; Services → Credentials</strong></li>
              <li>Click <strong style={{ color: "var(--color-text-dim)" }}>Create Credentials → OAuth client ID</strong></li>
              <li>If prompted, configure the <strong style={{ color: "var(--color-text-dim)" }}>consent screen</strong> first —
                choose External, add your email as a test user</li>
              <li>Application type: <strong style={{ color: "var(--color-text-dim)" }}>Desktop app</strong></li>
              <li>Click <strong style={{ color: "var(--color-text-dim)" }}>Create</strong>, then <strong style={{ color: "var(--color-text-dim)" }}>Download JSON</strong></li>
            </ol>
            {current.links.map((l) => (
              <div key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" style={{
                  display: "block", padding: "7px 12px",
                  background: "var(--color-surface-2)",
                  border: "1.5px solid var(--color-border-2)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 11, fontWeight: 600,
                  color: "var(--color-accent)", textDecoration: "none",
                }}>
                  {l.label} ↗
                </a>
                {"hint" in l && l.hint && (
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", padding: "3px 4px 0", lineHeight: 1.5 }}>
                    {l.hint}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: 14 }}>
              {current.body} It will be saved to{" "}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>~/.gmail-mcp/</span>.
            </div>
            <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFileChange} style={{ display: "none" }} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", padding: "12px",
                background: "var(--color-surface-2)",
                border: `1.5px dashed ${keysContent ? "var(--color-accent)" : "var(--color-border-2)"}`,
                borderRadius: "var(--radius-sm)",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                color: keysContent ? "var(--color-accent)" : "var(--color-text-muted)",
                transition: "border-color 0.2s, color 0.2s",
              }}
            >
              {fileName ? `✓  ${fileName}` : "Choose credentials JSON…"}
            </button>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 4 }}>
                Gmail address you're connecting:
              </div>
              <input
                type="email"
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "var(--color-surface-2)",
                  border: "1.5px solid var(--color-border-2)",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 8px",
                  fontSize: 11, fontFamily: "var(--font-mono)",
                  color: "var(--color-text-dim)", outline: "none",
                }}
              />
            </div>
            {error && (
              <div style={{ marginTop: 8, fontSize: 10, color: "var(--color-red, #ef4444)", lineHeight: 1.4 }}>
                {error}
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
              Only Gmail scopes are requested. Credentials stay local and are never sent to any server.
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <button
            onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)}
            style={{
              padding: "6px 14px",
              background: "none",
              border: "1.5px solid var(--color-border-2)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text-muted)",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >
            {step === 0 ? "Cancel" : "← Back"}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              style={{
                padding: "6px 16px",
                background: "var(--color-accent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#000",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSaveAndConnect}
              disabled={!canFinish || saving}
              style={{
                padding: "6px 16px",
                background: "var(--color-accent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#000",
                fontSize: 11, fontWeight: 700,
                cursor: !canFinish || saving ? "default" : "pointer",
                opacity: !canFinish || saving ? 0.45 : 1,
              }}
            >
              {saving ? "Saving…" : "Save & Connect →"}
            </button>
          )}
        </div>
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
  const [showWizard, setShowWizard] = useState(false);
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

  const handleAddClick = async () => {
    setError(null);
    const hasKeys = await invoke<boolean>("gmail_has_keys");
    if (!hasKeys) {
      setShowWizard(true);
    } else {
      setEmailInput("");
      setShowEmailPrompt(true);
    }
  };

  const handleWizardComplete = (email: string) => {
    setShowWizard(false);
    runAddAccount(email);
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
    <>
      {showWizard && (
        <GmailSetupWizard
          onComplete={handleWizardComplete}
          onClose={() => setShowWizard(false)}
        />
      )}

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
    </>
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
