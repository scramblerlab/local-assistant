import { invoke, Channel } from "@tauri-apps/api/core";
import type { ChatMessage, OllamaModel, OllamaPullChunk, OllamaStreamChunk, OllamaVersionResponse } from "../types/ollama";

const BASE = "http://localhost:11434";
export const CLOUD_BASE = "https://ollama.com";

export async function getVersion(): Promise<OllamaVersionResponse> {
  const res = await fetch(`${BASE}/api/version`);
  return res.json();
}

export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${BASE}/api/tags`);
  const data = await res.json();
  return data.models ?? [];
}

// Module-level cache so we only fetch model info once per model per session
const contextLengthCache = new Map<string, number>();
const capabilitiesCache = new Map<string, string[]>();
const cloudCapabilitiesCache = new Map<string, string[]>();

export async function getModelContextLength(name: string): Promise<number> {
  if (contextLengthCache.has(name)) return contextLengthCache.get(name)!;

  try {
    const res = await fetch(`${BASE}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();

    // Newer Ollama: model_info object
    const fromInfo =
      data?.model_info?.["llama.context_length"] ??
      data?.model_info?.["context_length"];

    // Older Ollama: parameters string e.g. "num_ctx 4096\n..."
    const fromParams = data?.parameters
      ? parseInt((data.parameters as string).match(/num_ctx\s+(\d+)/)?.[1] ?? "0")
      : 0;

    const length = fromInfo ?? (fromParams || 4096);
    contextLengthCache.set(name, length);
    return length;
  } catch {
    return 4096; // safe fallback
  }
}

export async function getModelCapabilities(name: string): Promise<string[]> {
  if (capabilitiesCache.has(name)) return capabilitiesCache.get(name)!;
  try {
    const res = await fetch(`${BASE}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    const capabilities: string[] = data?.capabilities ?? [];
    capabilitiesCache.set(name, capabilities);
    return capabilities;
  } catch {
    return [];
  }
}

export async function listCloudModels(apiKey: string): Promise<OllamaModel[]> {
  const models = await invoke<OllamaModel[]>("cloud_list_models", { apiKey });
  return models;
}

export async function getCloudModelCapabilities(name: string, apiKey: string): Promise<string[]> {
  const cacheKey = `${apiKey.slice(-8)}:${name}`;
  if (cloudCapabilitiesCache.has(cacheKey)) return cloudCapabilitiesCache.get(cacheKey)!;
  try {
    const caps = await invoke<string[]>("cloud_get_capabilities", { name, apiKey });
    cloudCapabilitiesCache.set(cacheKey, caps);
    return caps;
  } catch {
    return [];
  }
}

export async function* cloudChatStream(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<OllamaStreamChunk> {
  const queue: string[] = [];
  let notify: (() => void) | null = null;
  let finished = false;
  let streamError: Error | null = null;

  const channel = new Channel<string>();
  channel.onmessage = (line: string) => {
    queue.push(line);
    notify?.();
    notify = null;
  };

  const invokePromise = invoke("cloud_chat_stream", {
    model,
    messages,
    apiKey,
    onChunk: channel,
  }).then(() => {
    finished = true;
    notify?.();
  }).catch((e: unknown) => {
    streamError = e instanceof Error ? e : new Error(String(e));
    finished = true;
    notify?.();
  });

  signal?.addEventListener("abort", () => {
    finished = true;
    notify?.();
  });

  while (!finished || queue.length > 0) {
    if (queue.length === 0 && !finished) {
      await new Promise<void>((r) => { notify = r; });
    }
    if (streamError) throw streamError;
    if (signal?.aborted) break;
    while (queue.length > 0) {
      const line = queue.shift()!;
      try {
        yield JSON.parse(line) as OllamaStreamChunk;
      } catch {
        // skip malformed lines
      }
    }
  }

  await invokePromise.catch(() => {});
}

export async function deleteModel(name: string): Promise<void> {
  await fetch(`${BASE}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function* chatStream(
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<OllamaStreamChunk> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as OllamaStreamChunk;
      } catch {
        // skip malformed lines
      }
    }
  }
}

export async function* pullStream(
  name: string,
  signal?: AbortSignal
): AsyncGenerator<OllamaPullChunk> {
  const res = await fetch(`${BASE}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = res.body ? await res.text() : "";
    console.error("[pullStream] HTTP error", res.status, body);
    throw new Error(`Pull error ${res.status}: ${body || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as OllamaPullChunk;
      } catch {
        // skip
      }
    }
  }
}
