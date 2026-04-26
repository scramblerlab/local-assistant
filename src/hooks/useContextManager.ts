import { useCallback, useRef } from "react";
import { chatStream } from "../services/ollama";
import { getModelContextLength } from "../services/ollama";
import { parseStreamChunk } from "../services/streamParser";
import { estimateMessageTokens } from "../utils/tokenEstimate";
import { useChatStore } from "../stores/chatStore";
import { saveHistory } from "../services/history";
import type { ChatMessage } from "../types/ollama";
import type { Turn } from "../types/chat";

// Reserve headroom for the next response and structural overhead
const RESPONSE_RESERVE = 1500;
// Trigger auto-compact when usage exceeds this fraction of context window
const AUTO_COMPACT_THRESHOLD = 0.75;
// How many recent turns to keep after a compact
const KEEP_AFTER_COMPACT = 3;

export function useContextManager(model: string) {
  const { turns, compactSummary, applyCompact } = useChatStore();
  const compacting = useRef(false);

  /** Build the messages array for an Ollama /api/chat call, truncated to fit the model's context window. */
  const buildMessages = useCallback(
    async (systemPrompt: string, pendingUserMessage: string): Promise<ChatMessage[]> => {
      const contextLength = await getModelContextLength(model);
      const limit = contextLength - RESPONSE_RESERVE;

      // System block (includes compact summary when present)
      const systemContent = compactSummary
        ? `${systemPrompt}\n\n## Prior conversation summary\n${compactSummary}`
        : systemPrompt;

      let budget = limit - estimateMessageTokens("system", systemContent);
      budget -= estimateMessageTokens("user", pendingUserMessage);

      // Walk history newest-first, accumulate turns that fit
      const realTurns = turns.filter((t) => !t.isCompact && !t.isStreaming);
      const included: Turn[] = [];

      for (let i = realTurns.length - 1; i >= 0; i--) {
        const t = realTurns[i];
        const assistantText = t.segments
          .filter((s) => s.kind !== "thinking")
          .map((s) => s.content)
          .join("");
        const cost =
          estimateMessageTokens("user", t.userMessage) +
          estimateMessageTokens("assistant", assistantText);
        if (budget - cost < 0) break;
        budget -= cost;
        included.unshift(t);
      }

      const messages: ChatMessage[] = [{ role: "system", content: systemContent }];
      for (const t of included) {
        messages.push({ role: "user", content: t.userMessage });
        messages.push({
          role: "assistant",
          content: t.segments
            .filter((s) => s.kind !== "thinking")
            .map((s) => s.content)
            .join(""),
        });
      }
      messages.push({ role: "user", content: pendingUserMessage });
      return messages;
    },
    [model, turns, compactSummary]
  );

  /** Estimate total tokens currently used by the conversation. */
  const estimateCurrentUsage = useCallback(
    async (systemPrompt: string): Promise<{ used: number; limit: number }> => {
      const limit = await getModelContextLength(model);
      const systemContent = compactSummary
        ? `${systemPrompt}\n\n## Prior conversation summary\n${compactSummary}`
        : systemPrompt;
      let used = estimateMessageTokens("system", systemContent);
      for (const t of turns.filter((t) => !t.isCompact && !t.isStreaming)) {
        used += estimateMessageTokens("user", t.userMessage);
        used += estimateMessageTokens(
          "assistant",
          t.segments.filter((s) => s.kind !== "thinking").map((s) => s.content).join("")
        );
      }
      return { used, limit };
    },
    [model, turns, compactSummary]
  );

  /** Run a compact: summarise all-but-last turns, then trim the store. */
  const runCompact = useCallback(
    async (signal?: AbortSignal): Promise<string> => {
      const realTurns = turns.filter((t) => !t.isCompact && !t.isStreaming);
      const toSummarise = realTurns.slice(0, -KEEP_AFTER_COMPACT);

      if (toSummarise.length === 0) return compactSummary ?? "";

      const priorContext = compactSummary
        ? `Previously summarised context:\n${compactSummary}\n\n`
        : "";

      const transcript = toSummarise
        .map((t) => {
          const response = t.segments
            .filter((s) => s.kind !== "thinking")
            .map((s) => s.content)
            .join("");
          return `User: ${t.userMessage}\nAssistant: ${response}`;
        })
        .join("\n\n");

      const messages: ChatMessage[] = [
        {
          role: "system",
          content:
            "You are a conversation summariser. Produce a dense, factual summary that preserves all key information, decisions, and context needed to continue the conversation seamlessly. Write in third-person present tense. Be thorough but concise.",
        },
        {
          role: "user",
          content: `${priorContext}Summarise this conversation:\n\n${transcript}`,
        },
      ];

      let summary = "";
      for await (const chunk of chatStream(model, messages, signal)) {
        const parsed = parseStreamChunk(chunk);
        if (parsed?.kind === "final") summary += parsed.delta;
        if (parsed?.kind === "done") break;
      }

      summary = summary.trim();
      applyCompact(summary, KEEP_AFTER_COMPACT);

      // Persist after compact
      const nextTurns = useChatStore.getState().turns;
      await saveHistory(nextTurns, summary);

      return summary;
    },
    [model, turns, compactSummary, applyCompact]
  );

  /** Check usage after a turn and auto-compact if over threshold. */
  const maybeAutoCompact = useCallback(
    async (systemPrompt: string) => {
      if (compacting.current) return;
      const { used, limit } = await estimateCurrentUsage(systemPrompt);
      if (used / limit < AUTO_COMPACT_THRESHOLD) return;

      compacting.current = true;
      try {
        await runCompact();
      } finally {
        compacting.current = false;
      }
    },
    [estimateCurrentUsage, runCompact]
  );

  return { buildMessages, runCompact, maybeAutoCompact, estimateCurrentUsage };
}
