import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { refreshSkills } from "./useSkills";
import { chatStream, cloudChatStream } from "../services/ollama";
import { parseStreamChunk } from "../services/streamParser";
import { splitFinalSegment } from "../utils/responseParser";
import { saveSession } from "../services/sessions";
import { webSearch, webFetch } from "../services/webTools";
import { callMcpTool } from "../services/mcp";
import { useMcpStore } from "../stores/mcpStore";
import { usePermissionStore } from "../stores/permissionStore";
import { extractToolCalls, stripToolCalls } from "../utils/toolParser";
import { useChatStore } from "../stores/chatStore";
import { useSkillStore } from "../stores/skillStore";
import { useSearchStore } from "../stores/searchStore";
import { useModelStore } from "../stores/modelStore";
import { useContextManager } from "./useContextManager";
import { useCloudConfig, useCloudModels } from "./useModels";
import type { ChatMessage } from "../types/ollama";
import type { MessageSegment } from "../types/chat";
import type { SkillMeta } from "../types/skill";
import type { McpTool } from "../services/mcp";
import type { McpServerSummary } from "../services/mcp";

const BASE_SYSTEM_PROMPT = `You are a helpful local AI assistant. Be concise and precise.

## Web & File Tools

You have tools available. To use one, emit the tag on its own line — the app intercepts it, executes it, and returns the result. Replace placeholder values with real ones; never emit the examples verbatim.

### Search the web
\`\`\`
<tool_call>{"name": "web_search", "args": {"query": "search terms here"}}</tool_call>
\`\`\`

### Fetch a URL
\`\`\`
<tool_call>{"name": "web_fetch", "args": {"url": "https://example.com/page"}}</tool_call>
\`\`\`

### Write a file
<write_file path="~/.local-assistant/skills/my-skill/SKILL.md">
file content goes here — no escaping needed
</write_file>

### Read a file / list a directory
\`\`\`
<tool_call>{"name": "read_file", "args": {"path": "~/some/file.txt"}}</tool_call>
<tool_call>{"name": "list_dir", "args": {"path": "~/.local-assistant/skills"}}</tool_call>
\`\`\`

### Rules
- For current information (news, weather, prices, recent events), use web_search first. Note: web_search requires a provider (Ollama or Brave) to be selected in the Web Search section of the sidebar.
- Use web_fetch to read the full content of a specific URL.
- Use write_file tags (not tool_call) to save files; content goes between the tags, no JSON escaping.
- Use read_file to read local files. Use list_dir to list directory contents.
- After receiving a tool result, continue naturally — do not repeat the tag.
- You may call multiple tools per answer, one tag at a time.

## Extending This Assistant

### Add a Skill
Skills inject extra instructions into this system prompt and are always active once installed.
Create \`~/.local-assistant/skills/{name}/SKILL.md\`:

\`\`\`
---
name: my-skill
description: One-line description shown in the sidebar
---

## Instructions

Your instructions here — injected verbatim into the system prompt.
\`\`\`

The skill appears in the sidebar immediately and is always active.
You can create skill files directly using the write_file tool.

### Add an MCP Server
This app (Generative Assistant) loads MCP servers from exactly one file: \`~/.local-assistant/config.json\`.
There is no other config location. The format is fixed — do not invent key names.

When a user asks how to add an MCP server, give them these exact steps:

1. Read the current config first:
<tool_call>{"name": "read_file", "args": {"path": "~/.local-assistant/config.json"}}</tool_call>

2. Add the new server to the \`mcp_servers\` array and write the file back. Example result:
\`\`\`json
{
  "brave_search_api_key": "...",
  "mcp_servers": [
    { "id": "shopify-dev", "command": "npx", "args": ["-y", "@shopify/dev-mcp@latest"] },
    { "id": "new-server",  "command": "npx", "args": ["-y", "@org/mcp-package@latest"] }
  ]
}
\`\`\`
The required fields are exactly: \`id\` (display name), \`command\` (executable), \`args\` (array of strings).
Do not add any other fields.

3. Tell the user to click the **↺ Reload** button in the **MCP section of the sidebar** (bottom of the left panel).
   The server will start, connect, and its tools will appear as orange pills immediately.

### Add an Ollama Cloud API Key
Ollama Cloud lets you use hosted models without downloading them. Get a key at https://ollama.com/settings/keys.

Add it to \`~/.local-assistant/config.json\`:
\`\`\`json
{
  "ollama_cloud_api_key": "sk-...",
  "brave_search_api_key": "...",
  "mcp_servers": [...]
}
\`\`\`
The Cloud section in the sidebar will appear immediately and list available cloud models.`;

const APP_INTERNAL_PREFIX = "~/.local-assistant";
const FILE_OP_TOOLS = new Set([
  "read_file", "write_file", "list_dir",
  "create_dir", "rename_path", "delete_path",
]);

function operationLabel(name: string, args: Record<string, string>): string {
  switch (name) {
    case "read_file":   return `read file: ${args.path ?? ""}`;
    case "list_dir":    return `list directory: ${args.path ?? ""}`;
    case "write_file":  return `write file: ${args.path ?? ""}`;
    case "create_dir":  return `create directory: ${args.path ?? ""}`;
    case "rename_path": return `rename ${args.from ?? ""} → ${args.to ?? ""}`;
    case "delete_path": return `delete: ${args.path ?? ""}`;
    default:            return name;
  }
}

async function checkPermissionForOp(
  name: string,
  args: Record<string, string>,
): Promise<boolean> {
  const { isApproved, requestPermission, homeDir, approvedFolders } = usePermissionStore.getState();
  console.log("[checkPermission] tool:", name, "args:", args, "homeDir:", homeDir, "approvedFolders:", approvedFolders);

  const paths: string[] = [];
  if (name === "rename_path") {
    if (args.from) paths.push(args.from);
    if (args.to) paths.push(args.to);
  } else {
    const p = args.path ?? "";
    if (p) paths.push(p);
  }

  for (const path of paths) {
    // Always allow internal app paths
    if (path.startsWith(APP_INTERNAL_PREFIX)) {
      console.log("[checkPermission] allowing internal path:", path);
      continue;
    }

    // In-memory check (zero IPC latency for already-approved paths)
    const absPath =
      path.startsWith("~/") ? (homeDir ? homeDir + path.slice(1) : path) : path;
    console.log("[checkPermission] checking path:", path, "absPath:", absPath, "isApproved(abs):", isApproved(absPath), "isApproved(tilde):", isApproved(path));
    if (isApproved(absPath) || isApproved(path)) {
      console.log("[checkPermission] path already approved, skipping dialog");
      continue;
    }

    console.log("[checkPermission] requesting permission for:", path);
    const granted = await requestPermission(path, operationLabel(name, args));
    console.log("[checkPermission] permission result:", granted);
    if (!granted) return false;
  }
  return true;
}

function buildFilePermissionsSection(approvedFolders: string[]): string {
  const folderList =
    approvedFolders.length > 0
      ? approvedFolders.map((f) => `- \`${f}\``).join("\n")
      : "- *(none yet — a permission dialog will appear when you access any folder)*";

  return `\n\n## File & Directory Operations

You have access to these file operation tools:

### Create a directory
\`\`\`
<tool_call>{"name": "create_dir", "args": {"path": "~/path/to/new-dir"}}</tool_call>
\`\`\`

### Rename or move a file/directory
\`\`\`
<tool_call>{"name": "rename_path", "args": {"from": "~/old/path", "to": "~/new/path"}}</tool_call>
\`\`\`

### Delete a file or directory
\`\`\`
<tool_call>{"name": "delete_path", "args": {"path": "~/path/to/remove"}}</tool_call>
\`\`\`

### Currently approved folders (and all their subfolders)
${folderList}

### Rules
- \`~/.local-assistant/\` is always accessible — no permission required.
- For all other folders, a permission dialog appears automatically when you first access them. You do not need to ask the user in chat — just use the tool.
- Paths outside the user's home directory (\`~/\`) require two confirmations and are never saved to the permission list.
- All write, create, rename, and delete operations are verified server-side after execution. You will receive an error message if verification fails.
- After any destructive operation (delete, rename, overwrite), confirm with the user before proceeding if the action was not explicitly requested.`;
}

function buildMcpSection(servers: McpServerSummary[]): string {
  if (servers.length === 0) return "";
  const parts = servers.map((server) => {
    const toolDocs = server.tools.map((tool: McpTool) => {
      const props = tool.inputSchema?.properties ?? {};
      const required = tool.inputSchema?.required ?? [];
      const exampleArgs: Record<string, string> = {};
      for (const key of required) {
        exampleArgs[key] = `<${key}>`;
      }
      const optional = Object.keys(props).filter((k) => !required.includes(k));
      const optHint = optional.length > 0 ? ` Optional args: ${optional.join(", ")}.` : "";
      return `**${tool.name}**: ${tool.description ?? ""}${optHint}\n<tool_call>{"name": "mcp__${server.id}__${tool.name}", "args": ${JSON.stringify(exampleArgs)}}</tool_call>`;
    }).join("\n\n");
    return `### ${server.id}\n${toolDocs}`;
  });
  return `\n\n## MCP Tools\n\n${parts.join("\n\n")}`;
}

function buildSystemPrompt(
  availableSkills: SkillMeta[],
  activeSkills: ReturnType<typeof useSkillStore.getState>["active"],
  mcpServers: McpServerSummary[],
  approvedFolders: string[],
): string {
  let prompt = BASE_SYSTEM_PROMPT;

  // Always tell the LLM which skills are installed
  if (availableSkills.length > 0) {
    const catalog = availableSkills
      .map((s) => `- **${s.name}** (path: \`${s.path}\`): ${s.description}`)
      .join("\n");
    prompt += `\n\n# Available Skills\nThe following skills are installed and always active in this assistant:\n${catalog}`;
  }

  // Inject full instructions for skills the user has toggled on
  const active = Array.from(activeSkills.values());
  if (active.length > 0) {
    const block = active
      .map((s) => `## ${s.frontmatter.name}\n\n${s.body}`)
      .join("\n\n---\n\n");
    prompt += `\n\n# Active Skills (full instructions loaded)\n\n${block}`;
  }

  prompt += buildFilePermissionsSection(approvedFolders);
  prompt += buildMcpSection(mcpServers);

  return prompt;
}

const MAX_TOOL_ROUNDS = 8;
const TOOL_TIMEOUT_MS = 15_000;
const MAX_RESULT_CHARS = 6_000;

// Placeholder arg values that appear in system-prompt examples — never execute these
const PLACEHOLDER_ARGS = new Set([
  "search terms here",
  "https://example.com/page",
  "~/some/file.txt",
  "~/.local-assistant/skills",
]);

function isPlaceholderArg(v: string): boolean {
  return PLACEHOLDER_ARGS.has(v) || (v.startsWith("<") && v.endsWith(">"));
}

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  if (name === "web_search") {
    const provider = useSearchStore.getState().provider;
    if (!provider) {
      return "Web search is not configured. Ask the user to select a provider (Ollama or Brave) in the Web Search section of the sidebar.";
    }
    const results = await webSearch(args.query ?? "", provider);
    return results.length === 0
      ? "No results found."
      : results.map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`).join("\n\n");
  }
  if (name === "web_fetch") {
    return webFetch(args.url ?? "");
  }
  if (name === "write_file") {
    const path = args.path ?? "";
    await invoke("write_file", { path, content: args.content ?? "" });
    if (path.includes(".local-assistant/skills")) refreshSkills().catch(console.error);
    return `File written to ${path}`;
  }
  if (name === "read_file") {
    return await invoke<string>("read_file", { path: args.path ?? "" });
  }
  if (name === "list_dir") {
    const entries = await invoke<string[]>("list_dir", { path: args.path ?? "" });
    return entries.join("\n");
  }
  if (name === "create_dir") {
    await invoke("create_dir", { path: args.path ?? "" });
    return `Directory created: ${args.path}`;
  }
  if (name === "rename_path") {
    await invoke("rename_path", { from: args.from ?? "", to: args.to ?? "" });
    return `Renamed: ${args.from} → ${args.to}`;
  }
  if (name === "delete_path") {
    await invoke("delete_path", { path: args.path ?? "" });
    return `Deleted: ${args.path}`;
  }
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    const serverId = parts[1];
    const toolName = parts.slice(2).join("__");
    return callMcpTool(serverId, toolName, args as Record<string, unknown>);
  }
  return `Unknown tool: ${name}`;
}

function truncateResult(result: string): string {
  if (result.length <= MAX_RESULT_CHARS) return result;
  return result.slice(0, MAX_RESULT_CHARS) + "\n…[result truncated]";
}

export function useChat(model: string) {
  const {
    addTurn,
    appendToSegment,
    addSegment,
    replaceSegmentsFrom,
    replaceLastSegments,
    finalizeTurn,
    setAbortController,
    abortController,
  } = useChatStore();
  const { active: activeSkills, available: availableSkills } = useSkillStore();
  const { buildMessages, runCompact, maybeAutoCompact } = useContextManager(model);
  const { data: cloudConfig } = useCloudConfig();
  const { data: cloudModels } = useCloudModels();

  const [isCompacting, setIsCompacting] = useState(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    useMcpStore.getState().initialize();
  }, []);

  // Reconcile isCloudModel flag when the cloud model list loads — fixes stale
  // localStorage state from before the isCloudModel field existed.
  useEffect(() => {
    if (!cloudModels || !model) return;
    const shouldBeCloud = cloudModels.some((m) => m.name === model);
    if (shouldBeCloud !== useModelStore.getState().isCloudModel) {
      useModelStore.getState().setActiveModel(model, shouldBeCloud);
    }
  }, [cloudModels, model]);

  const sendMessage = useCallback(
    async (text: string, images: string[] = []) => {
      if (!text.trim() || !model) return;
      if (sendingRef.current) return;
      sendingRef.current = true;

      try {

      // ── /compact command ──────────────────────────────────────────────
      if (text.trim() === "/compact") {
        setIsCompacting(true);
        const ac = new AbortController();
        setAbortController(ac);
        try {
          await runCompact(ac.signal);
        } finally {
          setIsCompacting(false);
          setAbortController(null);
        }
        return;
      }

      // ── Normal message ─────────────────────────────────────────────────
      const systemPrompt = buildSystemPrompt(availableSkills, activeSkills, useMcpStore.getState().servers, usePermissionStore.getState().approvedFolders);
      const messages = await buildMessages(systemPrompt, text);

      const tId = addTurn(text, model, images.length > 0 ? images : undefined);
      const ac = new AbortController();
      setAbortController(ac);

      // Attach images to the last user message if provided
      if (images.length > 0) {
        const last = messages[messages.length - 1];
        if (last && last.role === "user") {
          messages[messages.length - 1] = { ...last, images };
        }
      }

      const cloudApiKey = cloudConfig?.apiKey ?? null;
      const isCloudModel = useModelStore.getState().isCloudModel;

      try {
        const conversationMessages: ChatMessage[] = [...messages];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          // Snapshot segment count before this round streams anything
          const segsBefore = useChatStore.getState().turns.find((t) => t.id === tId)?.segments.length ?? 0;
          let responseText = "";
          let finalText = ""; // non-thinking content only — used for tool extraction

          const streamGen = isCloudModel && cloudApiKey
            ? cloudChatStream(model, conversationMessages, cloudApiKey, ac.signal)
            : chatStream(model, conversationMessages, ac.signal);

          for await (const chunk of streamGen) {
            const parsed = parseStreamChunk(chunk);
            if (!parsed) continue;
            if (parsed.kind === "done") break;
            if (parsed.delta) {
              responseText += parsed.delta;
              if (parsed.kind === "final") finalText += parsed.delta;
              appendToSegment(tId, parsed.kind as "thinking" | "final", parsed.delta);
            }
          }

          // Extract tool calls from final content only; filter placeholders and deduplicate
          const seen = new Set<string>();
          const toolCalls = extractToolCalls(finalText).filter((tc) => {
            if (Object.values(tc.args).some(isPlaceholderArg)) return false;
            const key = `${tc.name}:${JSON.stringify(tc.args)}`;
            return seen.has(key) ? false : (seen.add(key), true);
          });
          if (toolCalls.length === 0) break;

          // Clean preamble text (everything before the first <tool_call>)
          const preamble = stripToolCalls(finalText);
          const cleanedSegments: MessageSegment[] = preamble.trim()
            ? [{ id: crypto.randomUUID(), kind: "final", content: preamble }]
            : [];

          // Replace only this round's streamed segments, preserving prior pills
          replaceSegmentsFrom(tId, segsBefore, cleanedSegments);

          // Execute each tool call sequentially
          const toolResults: string[] = [];
          for (const toolCall of toolCalls) {
            const toolKey = `${toolCall.name}:${toolCall.args.query ?? toolCall.args.url ?? ""}`;
            addSegment(tId, "tool-use", toolKey);
            let result: string;
            try {
              // Permission check is OUTSIDE the timeout race — it waits indefinitely
              // for the user to click Allow/Deny in the dialog.
              if (FILE_OP_TOOLS.has(toolCall.name)) {
                const allowed = await checkPermissionForOp(toolCall.name, toolCall.args);
                if (!allowed) {
                  result = "Permission denied: the user did not grant access to the requested path.";
                  addSegment(tId, "tool-use", `done:${toolKey}`);
                  toolResults.push(`[${toolCall.name}]\n${result}`);
                  continue;
                }
              }
              // Actual I/O is inside the timeout race
              result = truncateResult(await Promise.race([
                executeTool(toolCall.name, toolCall.args),
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error("Timed out")), TOOL_TIMEOUT_MS)
                ),
              ]));
            } catch (err) {
              result = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
            addSegment(tId, "tool-use", `done:${toolKey}`);
            toolResults.push(`[${toolCall.name}]\n${result}`);
          }

          // Inject all results at once and continue
          const assistantMsg = preamble + toolCalls
            .map((tc) => `\n<tool_call>${JSON.stringify({ name: tc.name, args: tc.args })}</tool_call>`)
            .join("");
          conversationMessages.push(
            { role: "assistant", content: assistantMsg },
            { role: "user", content: `<tool_result>\n${toolResults.join("\n\n")}\n</tool_result>\n\nPlease continue your response using this information.` }
          );
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          // user stopped — nothing to show
        } else {
          const raw = e instanceof Error ? e.message : String(e);
          const is403 = raw.includes("403");
          const errorText = is403
            ? `${raw}\n\nUpgrade your Ollama plan to use this cloud model: [ollama.com/pricing](https://ollama.com/pricing)`
            : raw;
          addSegment(tId, "final", `> ⚠️ ${errorText}`);
        }
      }

      // Post-process: split "> " quoted blocks out of final segments
      const finalTurn = useChatStore.getState().turns.find((t) => t.id === tId);
      if (finalTurn) {
        const combined = finalTurn.segments
          .filter((s) => s.kind === "final")
          .map((s) => s.content)
          .join("");
        if (combined) {
          const parsed = splitFinalSegment(combined);
          if (parsed.some((s) => s.kind === "quoted")) {
            replaceLastSegments(tId, parsed);
          }
        }
      }

      // Mark any tool-use pills that never received a "done:" counterpart
      const preFinalTurn = useChatStore.getState().turns.find((t) => t.id === tId);
      if (preFinalTurn) {
        const pills = preFinalTurn.segments.filter((s) => s.kind === "tool-use");
        const doneKeys = new Set(pills.filter((s) => s.content.startsWith("done:")).map((s) => s.content.slice(5)));
        pills.filter((s) => !s.content.startsWith("done:") && !doneKeys.has(s.content))
          .forEach((s) => addSegment(tId, "tool-use", `done:${s.content}`));
      }

      finalizeTurn(tId);
      setAbortController(null);

      const state = useChatStore.getState();
      await saveSession({
        id: state.currentSessionId,
        title: "New chat",
        createdAt: state.currentSessionCreatedAt,
        updatedAt: Date.now(),
        turnCount: 0,
        turns: state.turns,
        compactSummary: state.compactSummary,
      });
      await maybeAutoCompact(systemPrompt);

      } finally {
        sendingRef.current = false;
      }
    },
    [
      model,
      activeSkills,
      addTurn,
      appendToSegment,
      addSegment,
      replaceSegmentsFrom,
      replaceLastSegments,
      finalizeTurn,
      setAbortController,
      buildMessages,
      runCompact,
      maybeAutoCompact,
      cloudConfig,
      cloudModels,
    ]
  );

  const stopStream = useCallback(() => {
    abortController?.abort();
    setAbortController(null);
  }, [abortController, setAbortController]);

  return { sendMessage, stopStream, isCompacting };
}
