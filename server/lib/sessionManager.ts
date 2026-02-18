interface SessionData {
  sessionId: string;
  chatHistory: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  lastActivity: number;
  requestCount: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 500;

const userSessions = new Map<string, SessionData>();

export function getSession(sessionId: string): SessionData {
  let session = userSessions.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      chatHistory: [],
      lastActivity: Date.now(),
      requestCount: 0,
    };
    userSessions.set(sessionId, session);
  }
  session.lastActivity = Date.now();
  session.requestCount++;
  return session;
}

export function updateSessionHistory(
  sessionId: string,
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>
) {
  const session = getSession(sessionId);
  session.chatHistory = history.slice(-20);
  session.lastActivity = Date.now();
}

export function clearSession(sessionId: string) {
  userSessions.delete(sessionId);
}

export function getActiveSessionCount(): number {
  return userSessions.size;
}

export function cleanupExpiredSessions() {
  const now = Date.now();
  const toDelete: string[] = [];
  userSessions.forEach((session, id) => {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      toDelete.push(id);
    }
  });
  for (const id of toDelete) {
    userSessions.delete(id);
  }

  if (userSessions.size > MAX_SESSIONS) {
    const sorted = Array.from(userSessions.entries())
      .sort((a, b) => a[1].lastActivity - b[1].lastActivity);
    const excess = sorted.slice(0, sorted.length - MAX_SESSIONS);
    for (const [id] of excess) {
      userSessions.delete(id);
    }
  }

  return toDelete.length;
}

setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
