import { useCallback, useState } from "react";
import { chatStream } from "../services/ollama";
import { parseStreamChunk } from "../services/streamParser";
import { splitFinalSegment } from "../utils/responseParser";
import { saveHistory } from "../services/history";
import { useChatStore } from "../stores/chatStore";
import { useSkillStore } from "../stores/skillStore";
import { useContextManager } from "./useContextManager";

const BASE_SYSTEM_PROMPT =
  "You are a helpful local AI assistant. Be concise and precise.";

function buildSystemPrompt(activeSkills: ReturnType<typeof useSkillStore.getState>["active"]): string {
  const skills = Array.from(activeSkills.values());
  if (skills.length === 0) return BASE_SYSTEM_PROMPT;
  const block = skills
    .map((s) => `## Skill: ${s.frontmatter.name}\n\n${s.body}`)
    .join("\n\n---\n\n");
  return `${BASE_SYSTEM_PROMPT}\n\n# Active Skills\n\n${block}`;
}

export function useChat(model: string) {
  const {
    addTurn,
    appendToSegment,
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
        for await (const chunk of chatStream(model, messages, ac.signal)) {
          const parsed = parseStreamChunk(chunk);
          if (!parsed) continue;
          if (parsed.kind === "done") break;
          if (parsed.delta) {
            appendToSegment(tId, parsed.kind as "thinking" | "final", parsed.delta);
          }
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

      // Persist then check whether auto-compact is needed
      const state = useChatStore.getState();
      await saveHistory(state.turns, state.compactSummary);
      await maybeAutoCompact(systemPrompt);
    },
    [
      model,
      activeSkills,
      addTurn,
      appendToSegment,
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
