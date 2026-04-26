import type { MessageSegment, SegmentKind } from "../types/chat";

let segId = 0;
function nextId() {
  return `seg-${++segId}`;
}

export function splitFinalSegment(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let buffer = "";

  const flush = (kind: SegmentKind) => {
    const trimmed = buffer.trim();
    if (trimmed) segments.push({ id: nextId(), kind, content: trimmed });
    buffer = "";
  };

  let inQuote = false;
  for (const line of content.split("\n")) {
    const isQuote = line.startsWith("> ") || line === ">";
    if (isQuote) {
      if (!inQuote) {
        flush("final");
        inQuote = true;
      }
      buffer += (buffer ? "\n" : "") + (line.startsWith("> ") ? line.slice(2) : "");
    } else {
      if (inQuote) {
        flush("quoted");
        inQuote = false;
      }
      buffer += (buffer ? "\n" : "") + line;
    }
  }
  flush(inQuote ? "quoted" : "final");
  return segments;
}
