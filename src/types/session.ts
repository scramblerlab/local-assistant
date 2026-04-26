import type { Turn } from "./chat";

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turnCount: number;
}

export interface Session extends SessionMeta {
  turns: Turn[];
  compactSummary: string | null;
}
