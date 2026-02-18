import { textToVector, cosineSimilarity, buildVocab } from "./vectorEngine";
import type { ScoutReport } from "./contextScout";

export interface ScoutLogEntry {
  timestamp: string;
  topic: string;
  vector: number[];
  summary: string;
  report: ScoutReport;
  source: "live" | "cached";
}

const MAX_ENTRIES = 5;
const CACHE_TTL_MS = 10 * 60 * 1000;
const SIMILARITY_THRESHOLD = 0.85;

let scoutLogs: ScoutLogEntry[] = [];

export function getScoutLogs(): ScoutLogEntry[] {
  return [...scoutLogs];
}

export function addScoutLog(topic: string, report: ScoutReport): ScoutLogEntry {
  buildVocab([topic, ...report.market_trends]);
  const vector = textToVector(topic);
  const summary = report.market_trends.slice(0, 3).join(" | ");

  const entry: ScoutLogEntry = {
    timestamp: new Date().toISOString(),
    topic,
    vector,
    summary: summary.length > 200 ? summary.substring(0, 200) : summary,
    report,
    source: "live",
  };

  scoutLogs.push(entry);
  if (scoutLogs.length > MAX_ENTRIES) {
    scoutLogs = scoutLogs.slice(-MAX_ENTRIES);
  }

  console.log(`[סקאוט-לוג] נוסף: "${topic.substring(0, 40)}" (${scoutLogs.length}/${MAX_ENTRIES})`);
  return entry;
}

export function findCachedScout(input: string): ScoutLogEntry | null {
  if (scoutLogs.length === 0) return null;

  const now = Date.now();
  buildVocab([input, ...scoutLogs.map(l => l.topic)]);
  const inputVec = textToVector(input);

  let bestMatch: ScoutLogEntry | null = null;
  let bestScore = 0;

  for (const entry of scoutLogs) {
    const entryTime = new Date(entry.timestamp).getTime();
    if (now - entryTime > CACHE_TTL_MS) continue;

    const similarity = cosineSimilarity(inputVec, entry.vector);
    if (similarity > SIMILARITY_THRESHOLD && similarity > bestScore) {
      bestScore = similarity;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    console.log(`[סקאוט-לוג] מטמון: "${input.substring(0, 40)}" ← "${bestMatch.topic.substring(0, 40)}" (דמיון: ${bestScore.toFixed(3)})`);
  }

  return bestMatch;
}
