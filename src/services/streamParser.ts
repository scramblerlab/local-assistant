import type { OllamaStreamChunk } from "../types/ollama";
import type { SegmentKind } from "../types/chat";

export interface ParsedChunk {
  kind: SegmentKind | "done";
  delta: string;
}

export function parseStreamChunk(chunk: OllamaStreamChunk): ParsedChunk | null {
  if (chunk.done) return { kind: "done", delta: "" };

  const thinking = chunk.message?.thinking;
  const content = chunk.message?.content;

  if (thinking) return { kind: "thinking", delta: thinking };
  if (content) return { kind: "final", delta: content };

  return null;
}
