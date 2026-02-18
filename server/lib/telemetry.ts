import { appendFile, mkdir, stat, rename, unlink } from "fs/promises";
import { join } from "path";

const TELEMETRY_DIR = join(process.cwd(), "telemetry");
const TELEMETRY_FILE = join(TELEMETRY_DIR, "telemetry.json");
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const writeQueue: string[] = [];
let isWriting = false;

async function ensureDir() {
  try { await mkdir(TELEMETRY_DIR, { recursive: true }); } catch {}
}

async function rotateIfNeeded() {
  try {
    const st = await stat(TELEMETRY_FILE);
    if (st.size > MAX_FILE_SIZE) {
      const rotated = TELEMETRY_FILE.replace(".json", `.${Date.now()}.old.json`);
      await rename(TELEMETRY_FILE, rotated);
      const oldFiles: string[] = [];
      const { readdir } = await import("fs/promises");
      const files = await readdir(TELEMETRY_DIR);
      for (const f of files) {
        if (f.endsWith(".old.json")) oldFiles.push(f);
      }
      if (oldFiles.length > 3) {
        oldFiles.sort();
        for (const f of oldFiles.slice(0, oldFiles.length - 3)) {
          await unlink(join(TELEMETRY_DIR, f)).catch(() => {});
        }
      }
    }
  } catch {}
}

async function flushQueue() {
  if (isWriting || writeQueue.length === 0) return;
  isWriting = true;
  try {
    await ensureDir();
    await rotateIfNeeded();
    const batch = writeQueue.splice(0, writeQueue.length);
    const data = batch.join("");
    await appendFile(TELEMETRY_FILE, data, "utf-8");
  } catch (err) {
    console.warn("[Telemetry] Write error:", err);
  } finally {
    isWriting = false;
    if (writeQueue.length > 0) flushQueue();
  }
}

export function logTelemetry(event: {
  sessionId?: string;
  type: string;
  tab?: string;
  hasImage?: boolean;
  hasAudio?: boolean;
  responseTokens?: number;
  fallbackUsed?: boolean;
  error?: string;
  durationMs?: number;
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  writeQueue.push(JSON.stringify(entry) + "\n");
  flushQueue();
}
