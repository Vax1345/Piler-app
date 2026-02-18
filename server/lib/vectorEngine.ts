import type { Memory } from "@shared/schema";

const VOCAB_SIZE = 200;

const HE_STOPWORDS = new Set([
  "של", "את", "על", "עם", "אל", "מן", "לא", "כי", "או", "גם", "אם", "הוא", "היא", "הם", "הן",
  "אני", "אתה", "את", "אנחנו", "הם", "זה", "זו", "זאת", "אלה", "כל", "יש", "אין", "לו", "לה",
  "שלי", "שלך", "שלו", "שלה", "שלנו", "שלהם", "היה", "היתה", "היו", "יהיה", "תהיה", "עוד",
  "רק", "כמו", "בין", "מה", "איך", "למה", "מי", "אבל", "אז", "כך", "אחרי", "לפני", "תוך",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "in", "for", "on",
  "with", "at", "by", "from", "and", "or", "but", "not", "this", "that", "it", "he", "she", "they",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !HE_STOPWORDS.has(w));
}

let globalVocab: Map<string, number> = new Map();
let idfWeights: Map<string, number> = new Map();
let vocabBuilt = false;
let corpusSize = 0;

export function buildVocab(texts: string[]): void {
  const docFreq: Map<string, number> = new Map();
  corpusSize = texts.length;

  for (const text of texts) {
    const tokens = tokenize(text);
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!seen.has(t)) {
        docFreq.set(t, (docFreq.get(t) || 0) + 1);
        seen.add(t);
      }
    }
  }

  const sorted = Array.from(docFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, VOCAB_SIZE);
  globalVocab = new Map();
  idfWeights = new Map();

  sorted.forEach(([word, df], idx) => {
    globalVocab.set(word, idx);
    idfWeights.set(word, Math.log((corpusSize + 1) / (df + 1)) + 1);
  });

  vocabBuilt = true;
}

export function textToVector(text: string): number[] {
  if (!vocabBuilt) {
    buildVocab([text]);
  }

  const tokens = tokenize(text);
  const vec = new Array(VOCAB_SIZE).fill(0);
  const tf: Map<string, number> = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }

  for (const [word, count] of Array.from(tf.entries())) {
    const idx = globalVocab.get(word);
    if (idx !== undefined) {
      const termFreq = count / tokens.length;
      const idf = idfWeights.get(word) || 1;
      vec[idx] = termFreq * idf;
    }
  }

  const norm = Math.sqrt(vec.reduce((sum: number, v: number) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0, normA = 0, normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function retrieveRelevantMemories(query: string, allMemories: Memory[], topK = 3, threshold = 0.7): Memory[] {
  if (allMemories.length === 0) return [];

  const queryVec = textToVector(query);

  const scored = allMemories.map(mem => ({
    memory: mem,
    score: cosineSimilarity(queryVec, mem.vector),
  }));

  scored.sort((a, b) => b.score - a.score);

  const aboveThreshold = scored.filter(s => s.score >= threshold);
  if (aboveThreshold.length > 0) {
    return aboveThreshold.slice(0, topK).map(s => s.memory);
  }
  return scored.slice(0, topK).map(s => s.memory);
}

export function buildUserProfile(allMemories: Memory[]): {
  topics: string[];
  interests: string[];
  totalMemories: number;
  categories: Record<string, number>;
} {
  const categories: Record<string, number> = {};
  const allWords: Map<string, number> = new Map();

  for (const mem of allMemories) {
    categories[mem.category] = (categories[mem.category] || 0) + 1;
    const tokens = tokenize(mem.text);
    for (const t of tokens) {
      allWords.set(t, (allWords.get(t) || 0) + 1);
    }
  }

  const topWords = Array.from(allWords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  return {
    topics: topWords.slice(0, 8),
    interests: topWords.slice(8, 15),
    totalMemories: allMemories.length,
    categories,
  };
}
