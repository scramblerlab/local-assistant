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
import { extractToolCalls, stripToolCalls } from "../utils/toolParser";
import { useChatStore } from "../stores/chatStore";
import { useSkillStore } from "../stores/skillStore";
import { useContextManager } from "./useContextManager";
import { useCloudConfig, useCloudModels } from "./useModels";
import type { ChatMessage } from "../types/ollama";
import type { MessageSegment } from "../types/chat";
import type { SkillMeta } from "../types/skill";
import type { McpTool } from "../services/mcp";
import type { McpServerSummary } from "../services/mcp";

const BASE_SYSTEM_PROMPT = `You are a helpful local AI assistant. Be concise and precise.

## Web & File Tools

You have tools available. Emit ONLY the tag below on its own line — the app executes it and returns the result.

### Search the web
<tool_call>{"name": "web_search", "args": {"query": "search terms here"}}</tool_call>

### Fetch a URL
<tool_call>{"name": "web_fetch", "args": {"url": "https://example.com/page"}}</tool_call>

### Write a file
<write_file path="~/.local-assistant/skills/my-skill/SKILL.md">
file content goes here — no escaping needed
</write_file>

### Read a file / list a directory
<tool_call>{"name": "read_file", "args": {"path": "~/some/file.txt"}}</tool_call>
<tool_call>{"name": "list_dir", "args": {"path": "~/.local-assistant/skills"}}</tool_call>

### Rules
- For current information (news, weather, prices, recent events), use web_search first.
- Use web_fetch to read the full content of a specific URL.
- Use write_file tags (not tool_call) to save files; content goes between the tags, no JSON escaping.
- Use read_file to read local files. Use list_dir to list directory contents.
- After receiving a tool result, continue naturally — do not repeat the tag.
- You may call multiple tools per answer, one tag at a time.

## Extending This Assistant

### Add a Skill
Skills inject extra instructions into this system prompt and appear as toggles in the sidebar.
Create \`~/.local-assistant/skills/{name}/SKILL.md\`:

\`\`\`
---
name: my-skill
description: One-line description shown in the sidebar
---

## Instructions

Your instructions here — injected verbatim into the system prompt when the skill is active.
\`\`\`

The skill appears in the sidebar immediately. The user toggles it on to activate it.
You can create skill files directly using the write_file tool.

### Add an MCP Server
This app (Local Assistant) loads MCP servers from exactly one file: \`~/.local-assistant/config.json\`.
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
): string {
  let prompt = BASE_SYSTEM_PROMPT;

  // Always tell the LLM which skills are installed, even if none are active
  if (availableSkills.length > 0) {
    const catalog = availableSkills
      .map((s) => `- **${s.name}** (path: \`${s.path}\`): ${s.description}`)
      .join("\n");
    prompt += `\n\n# Available Skills\nThe following skills are installed in this assistant. When a user's request matches a skill, mention it by name and let them know they can activate it in the sidebar to unlock full instructions.\n${catalog}`;
  }

  // Inject full instructions for skills the user has toggled on
  const active = Array.from(activeSkills.values());
  if (active.length > 0) {
    const block = active
      .map((s) => `## ${s.frontmatter.name}\n\n${s.body}`)
      .join("\n\n---\n\n");
    prompt += `\n\n# Active Skills (full instructions loaded)\n\n${block}`;
  }

  prompt += buildMcpSection(mcpServers);

  return prompt;
}

const MAX_TOOL_ROUNDS = 8;
const TOOL_TIMEOUT_MS = 15_000;

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  if (name === "web_search") {
    const results = await webSearch(args.query ?? "");
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
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    const serverId = parts[1];
    const toolName = parts.slice(2).join("__");
    return callMcpTool(serverId, toolName, args as Record<string, unknown>);
  }
  return `Unknown tool: ${name}`;
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
      const systemPrompt = buildSystemPrompt(availableSkills, activeSkills, useMcpStore.getState().servers);
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
      const isCloudModel = model.endsWith(":cloud") || (cloudModels?.some((m) => m.name === model) ?? false);

      try {
        const conversationMessages: ChatMessage[] = [...messages];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          // Snapshot segment count before this round streams anything
          const segsBefore = useChatStore.getState().turns.find((t) => t.id === tId)?.segments.length ?? 0;
          let responseText = "";

          const streamGen = isCloudModel && cloudApiKey
            ? cloudChatStream(model, conversationMessages, cloudApiKey, ac.signal)
            : chatStream(model, conversationMessages, ac.signal);

          for await (const chunk of streamGen) {
            const parsed = parseStreamChunk(chunk);
            if (!parsed) continue;
            if (parsed.kind === "done") break;
            if (parsed.delta) {
              responseText += parsed.delta;
              appendToSegment(tId, parsed.kind as "thinking" | "final", parsed.delta);
            }
          }

          const toolCalls = extractToolCalls(responseText);
          if (toolCalls.length === 0) break;

          // Clean preamble text (everything before the first <tool_call>)
          const preamble = stripToolCalls(responseText);
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
              result = await Promise.race([
                executeTool(toolCall.name, toolCall.args),
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error("Timed out")), TOOL_TIMEOUT_MS)
                ),
              ]);
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
