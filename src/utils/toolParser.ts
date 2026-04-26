export interface ToolCall {
  name: "web_search" | "web_fetch";
  args: Record<string, string>;
}

// Model stops generating after each JSON — closing tag is optional
const TOOL_CALL_RE = /<tool_call>([\s\S]*?)(?:<\/tool_call>|(?=<tool_call>)|$)/g;

/** Extract all tool calls from a text block. */
export function extractToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  let match: RegExpExecArray | null;
  TOOL_CALL_RE.lastIndex = 0;
  while ((match = TOOL_CALL_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && parsed.args) calls.push(parsed as ToolCall);
    } catch {
      // malformed JSON — skip
    }
  }
  return calls;
}

/** Return text up to (but not including) the first tool_call tag. */
export function stripToolCalls(text: string): string {
  const idx = text.indexOf("<tool_call>");
  return idx >= 0 ? text.slice(0, idx).trimEnd() : text;
}
