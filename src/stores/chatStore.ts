import { create } from "zustand";
import type { MessageSegment, SegmentKind, Turn } from "../types/chat";

let turnIdSeq = 0;
let segIdSeq = 0;

interface ChatState {
  turns: Turn[];
  compactSummary: string | null;
  abortController: AbortController | null;

  // Turn lifecycle
  addTurn: (userMessage: string, model: string) => string;
  appendToSegment: (turnId: string, kind: SegmentKind, delta: string) => void;
  replaceLastSegments: (turnId: string, segments: MessageSegment[]) => void;
  finalizeTurn: (turnId: string) => void;

  // Compact
  setCompactSummary: (summary: string) => void;
  applyCompact: (summary: string, keepRecentCount: number) => void;

  // Persistence bootstrap
  setHistory: (turns: Turn[], compactSummary: string | null) => void;

  setAbortController: (ac: AbortController | null) => void;
  clearHistory: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  turns: [],
  compactSummary: null,
  abortController: null,

  addTurn: (userMessage, model) => {
    const id = `turn-${++turnIdSeq}`;
    set((s) => ({
      turns: [...s.turns, { id, userMessage, segments: [], isStreaming: true, timestamp: Date.now(), model }],
    }));
    return id;
  },

  appendToSegment: (tId, kind, delta) => {
    set((s) => ({
      turns: s.turns.map((t) => {
        if (t.id !== tId) return t;
        const segs = [...t.segments];
        const last = segs[segs.length - 1];
        if (last && last.kind === kind) {
          segs[segs.length - 1] = { ...last, content: last.content + delta };
        } else {
          segs.push({ id: `seg-${++segIdSeq}`, kind, content: delta });
        }
        return { ...t, segments: segs };
      }),
    }));
  },

  replaceLastSegments: (tId, newSegments) => {
    set((s) => ({
      turns: s.turns.map((t) => {
        if (t.id !== tId) return t;
        const thinking = t.segments.filter((seg) => seg.kind === "thinking");
        return { ...t, segments: [...thinking, ...newSegments] };
      }),
    }));
  },

  finalizeTurn: (tId) => {
    set((s) => ({
      turns: s.turns.map((t) => (t.id === tId ? { ...t, isStreaming: false } : t)),
    }));
  },

  setCompactSummary: (summary) => set({ compactSummary: summary }),

  applyCompact: (summary, keepRecentCount) => {
    set((s) => {
      const realTurns = s.turns.filter((t) => !t.isCompact && !t.isStreaming);
      const kept = realTurns.slice(-keepRecentCount);
      const divider: Turn = {
        id: `turn-${++turnIdSeq}`,
        userMessage: "",
        segments: [],
        isStreaming: false,
        timestamp: Date.now(),
        model: "",
        isCompact: true,
      };
      return { turns: [divider, ...kept], compactSummary: summary };
    });
  },

  setHistory: (turns, compactSummary) => set({ turns, compactSummary }),

  setAbortController: (ac) => set({ abortController: ac }),

  clearHistory: () => set({ turns: [], compactSummary: null }),
}));
