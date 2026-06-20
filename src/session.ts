import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SESSION_DIR = join(homedir(), ".mini-claude", "sessions");

interface SessionMetadata {
  id: string;
  model: string;
  cwd: string;
  startTime: string;
  messageCount: number;
}

export interface SessionData {
  metadata: SessionMetadata;
  messages: any[];
}

function ensureDir() {
  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
}

export function saveSession(id: string, data: SessionData): void {
  ensureDir();
  writeFileSync(join(SESSION_DIR, `${id}.json`), JSON.stringify(data, null, 2));
}

export function loadSession(id: string): SessionData | null {
  const file = join(SESSION_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch { return null; }
}

export function getLatestSessionId(): string | null {
  ensureDir();
  const files = readdirSync(SESSION_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  const sessions = files
    .map((f) => {
      try { return JSON.parse(readFileSync(join(SESSION_DIR, f), "utf-8")); }
      catch { return null; }
    })
    .filter(Boolean);

  sessions.sort((a, b) =>
    new Date(b.metadata.startTime).getTime() - new Date(a.metadata.startTime).getTime()
  );
  return sessions[0]?.metadata.id || null;
}
