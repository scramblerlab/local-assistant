export interface ToolCall {
  name: string;
  args: Record<string, string>;
}

// Model stops generating after each JSON — closing tag is optional
const TOOL_CALL_RE = /<tool_call>([\s\S]*?)(?:<\/tool_call>|(?=<tool_call>)|(?=<write_file)|$)/g;

// write_file uses its own tag so file content is never embedded in JSON
const WRITE_FILE_RE = /<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/g;

// Escape literal control characters that LLMs sometimes emit inside JSON strings
function sanitizeJson(raw: string): string {
  return raw.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

// Fallback for write_file when the LLM embeds content with unescaped quotes in JSON.
// Works because content is always the last field, so the raw blob ends with: ...CONTENT"}}
function tryWriteFileFallback(raw: string): ToolCall | null {
  if (!raw.includes('"write_file"')) return null;
  const pathMatch = raw.match(/"path"\s*:\s*"([^"]+)"/);
  if (!pathMatch) return null;
  const marker = '"content": "';
  const start = raw.indexOf(marker);
  if (start === -1) return null;
  let content = raw.slice(start + marker.length);
  // Strip trailing structural close: last "}} that closes the content string + both objects
  const trailingClose = content.search(/"\s*\}\s*\}\s*$/);
  if (trailingClose >= 0) content = content.slice(0, trailingClose);
  return { name: "write_file", args: { path: pathMatch[1], content } };
}

/** Extract all tool calls from a text block. */
export function extractToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];

  // <tool_call> JSON tags (web_search, web_fetch, read_file, list_dir, ...)
  let match: RegExpExecArray | null;
  TOOL_CALL_RE.lastIndex = 0;
  while ((match = TOOL_CALL_RE.exec(text)) !== null) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(sanitizeJson(raw));
      if (parsed.name && parsed.args) calls.push(parsed as ToolCall);
    } catch {
      const fallback = tryWriteFileFallback(raw);
      if (fallback) calls.push(fallback);
    }
  }

  // <write_file path="...">content</write_file> tags
  WRITE_FILE_RE.lastIndex = 0;
  while ((match = WRITE_FILE_RE.exec(text)) !== null) {
    calls.push({ name: "write_file", args: { path: match[1], content: match[2] } });
  }

  return calls;
}

/** Return text up to (but not including) the first tool tag. */
export function stripToolCalls(text: string): string {
  const tagIdx = text.indexOf("<tool_call>");
  const wfIdx = text.indexOf("<write_file");
  const candidates = [tagIdx, wfIdx].filter((i) => i >= 0);
  if (candidates.length === 0) return text;
  return text.slice(0, Math.min(...candidates)).trimEnd();
}
