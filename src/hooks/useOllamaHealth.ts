import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "../services/ollama";

export type OllamaStatus = "checking" | "running" | "starting" | "not_running" | "not_installed";

export function useOllamaHealth() {
  const [status, setStatus] = useState<OllamaStatus>("checking");

  const check = useCallback(async () => {
    try {
      await getVersion();
      setStatus("running");
      return true;
    } catch {
      return false;
    }
  }, []);

  const startOllama = useCallback(async () => {
    setStatus("starting");
    try {
      await invoke("start_ollama_server");
      // Poll up to 5 seconds
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const ok = await check();
        if (ok) return;
      }
      setStatus("not_running");
    } catch {
      setStatus("not_running");
    }
  }, [check]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const running = await check();
      if (cancelled) return;
      if (running) return;

      const installed = await invoke<boolean>("check_ollama_installed");
      if (cancelled) return;
      if (!installed) {
        setStatus("not_installed");
        return;
      }

      // Installed but not running — auto-start
      await startOllama();
    };
    init();
    return () => { cancelled = true; };
  }, [check, startOllama]);

  return { status, retry: () => { setStatus("checking"); check().then((ok) => { if (!ok) setStatus("not_running"); }); }, startOllama };
}
