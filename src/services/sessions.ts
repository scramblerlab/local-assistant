import { invoke } from "@tauri-apps/api/core";
import type { Turn } from "../types/chat";
import type { Session, SessionMeta } from "../types/session";
import { loadHistory } from "./history";

const SESSIONS_DIR = "~/.local-assistant/sessions";
const INDEX_PATH = `${SESSIONS_DIR}/index.json`;
const MAX_SESSIONS = 10;

function sessionPath(id: string) {
  return `${SESSIONS_DIR}/${id}.json`;
}

function deriveTitle(turns: Turn[]): string {
  const first = turns.find((t) => t.userMessage && !t.isCompact);
  if (!first) return "New chat";
  return first.userMessage.length > 60
    ? first.userMessage.slice(0, 60) + "…"
    : first.userMessage;
}

function freshSession(): Session {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    turnCount: 0,
    turns: [],
    compactSummary: null,
  };
}

async function readIndex(): Promise<SessionMeta[]> {
  try {
    const raw = await invoke<string>("read_file", { path: INDEX_PATH });
    return JSON.parse(raw) as SessionMeta[];
  } catch {
    return [];
  }
}

async function writeIndex(index: SessionMeta[]): Promise<void> {
  await invoke("write_file", {
    path: INDEX_PATH,
    content: JSON.stringify(index, null, 2),
  });
}

export async function listSessions(): Promise<SessionMeta[]> {
  return readIndex();
}

export async function loadSession(id: string): Promise<Session> {
  const raw = await invoke<string>("read_file", { path: sessionPath(id) });
  const parsed = JSON.parse(raw) as Session;
  // Re-stamp IDs to avoid React key collisions
  return {
    ...parsed,
    turns: (parsed.turns ?? []).map((t) => ({
      ...t,
      id: crypto.randomUUID(),
      isStreaming: false,
      segments: (t.segments ?? []).map((s) => ({ ...s, id: crypto.randomUUID() })),
    })),
  };
}

export async function saveSession(session: Session): Promise<void> {
  const title = session.title === "New chat" ? deriveTitle(session.turns) : session.title;
  const updated: Session = {
    ...session,
    title,
    updatedAt: Date.now(),
    turnCount: session.turns.filter((t) => !t.isCompact && !t.isStreaming).length,
    // Don't persist in-flight streaming turns
    turns: session.turns.filter((t) => !t.isStreaming),
  };

  await invoke("write_file", {
    path: sessionPath(session.id),
    content: JSON.stringify(updated, null, 2),
  });

  // Update index
  const index = await readIndex();
  const meta: SessionMeta = {
    id: updated.id,
    title: updated.title,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    turnCount: updated.turnCount,
  };
  const filtered = index.filter((m) => m.id !== session.id);
  const newIndex = [meta, ...filtered].slice(0, MAX_SESSIONS);
  await writeIndex(newIndex);
}

export async function createSession(): Promise<Session> {
  const session = freshSession();
  await saveSession(session);
  return session;
}

/** Called once on app boot. Migrates old history.json if sessions don't exist yet. */
export async function initSessions(): Promise<Session> {
  const index = await readIndex();

  if (index.length > 0) {
    // Sessions already exist — load the most recent one
    try {
      return await loadSession(index[0].id);
    } catch {
      // File missing (e.g. corrupted) — fall through to create fresh
    }
  }

  // No sessions yet — check for legacy history.json to migrate
  const legacy = await loadHistory();
  if (legacy.turns.length > 0 || legacy.compactSummary) {
    const now = Date.now();
    const migrated: Session = {
      id: crypto.randomUUID(),
      title: deriveTitle(legacy.turns),
      createdAt: now,
      updatedAt: now,
      turnCount: legacy.turns.filter((t) => !t.isCompact).length,
      turns: legacy.turns,
      compactSummary: legacy.compactSummary,
    };
    await saveSession(migrated);
    return migrated;
  }

  // Truly fresh install
  return createSession();
}
