import type { ChatMessage, OllamaModel, OllamaPullChunk, OllamaStreamChunk, OllamaVersionResponse } from "../types/ollama";

const BASE = "http://localhost:11434";

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
  console.log("[chat] sending to ollama →", { model, messages });
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
