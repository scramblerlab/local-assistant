import { useCallback, useState } from "react";
import { chatStream } from "../services/ollama";
import { parseStreamChunk } from "../services/streamParser";
import { splitFinalSegment } from "../utils/responseParser";
import { saveHistory } from "../services/history";
import { webSearch, webFetch } from "../services/webTools";
import { extractToolCalls, stripToolCalls } from "../utils/toolParser";
import { useChatStore } from "../stores/chatStore";
import { useSkillStore } from "../stores/skillStore";
import { useContextManager } from "./useContextManager";
import type { ChatMessage } from "../types/ollama";
import type { MessageSegment } from "../types/chat";

const BASE_SYSTEM_PROMPT = `You are a helpful local AI assistant. Be concise and precise.

## Web Tools

You have two tools available. Use them whenever you need current or live information — news, weather, prices, recent events, specific webpages, etc. Do NOT say you cannot search the internet; instead, use the tools.

### How to call a tool

Emit ONLY the tag below (nothing else on that line). The app will execute it and return the result.

<tool_call>{"name": "web_search", "args": {"query": "search terms here"}}</tool_call>

<tool_call>{"name": "web_fetch", "args": {"url": "https://example.com/page"}}</tool_call>

### Example — user asks for today's news

User: What's in the news today?
Assistant:
<tool_call>{"name": "web_search", "args": {"query": "top news today ${new Date().toISOString().slice(0,10)}"}}</tool_call>

(tool result arrives)

Here are today's top stories: …

### Rules
- Always use web_search for anything about current events, today's date, latest versions, live data.
- Use web_fetch when the user gives you a URL or when a search result URL looks helpful.
- After receiving a tool result, continue your answer naturally — do not repeat the tag.
- You may call multiple tools per answer, one tag at a time.
- Never claim you cannot access the internet.`;

function buildSystemPrompt(activeSkills: ReturnType<typeof useSkillStore.getState>["active"]): string {
  const skills = Array.from(activeSkills.values());
  if (skills.length === 0) return BASE_SYSTEM_PROMPT;
  const block = skills
    .map((s) => `## Skill: ${s.frontmatter.name}\n\n${s.body}`)
    .join("\n\n---\n\n");
  return `${BASE_SYSTEM_PROMPT}\n\n# Active Skills\n\n${block}`;
}

const MAX_TOOL_ROUNDS = 8;

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
  const { active: activeSkills } = useSkillStore();
  const { buildMessages, runCompact, maybeAutoCompact } = useContextManager(model);

  const [isCompacting, setIsCompacting] = useState(false);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !model) return;

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
      const systemPrompt = buildSystemPrompt(activeSkills);
      const messages = await buildMessages(systemPrompt, text);

      const tId = addTurn(text, model);
      const ac = new AbortController();
      setAbortController(ac);

      try {
        const conversationMessages: ChatMessage[] = [...messages];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          // Snapshot segment count before this round streams anything
          const segsBefore = useChatStore.getState().turns.find((t) => t.id === tId)?.segments.length ?? 0;
          let responseText = "";

          for await (const chunk of chatStream(model, conversationMessages, ac.signal)) {
            const parsed = parseStreamChunk(chunk);
            if (!parsed) continue;
            if (parsed.kind === "done") break;
            if (parsed.delta) {
              responseText += parsed.delta;
              appendToSegment(tId, parsed.kind as "thinking" | "final", parsed.delta);
            }
          }

          const toolCalls = extractToolCalls(responseText);
          if (toolCalls.length === 0) break; // no tool calls — done

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
              result = await executeTool(toolCall.name, toolCall.args);
            } catch (err) {
              result = `Error: ${(err as Error).message}`;
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
        if ((e as Error).name !== "AbortError") console.error("Stream error:", e);
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

      finalizeTurn(tId);
      setAbortController(null);

      const state = useChatStore.getState();
      await saveHistory(state.turns, state.compactSummary);
      await maybeAutoCompact(systemPrompt);
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
    ]
  );

  const stopStream = useCallback(() => {
    abortController?.abort();
    setAbortController(null);
  }, [abortController, setAbortController]);

  return { sendMessage, stopStream, isCompacting };
}
