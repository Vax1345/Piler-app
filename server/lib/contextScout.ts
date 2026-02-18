import { GoogleGenAI } from "@google/genai";

const SCOUT_BUSINESS_KEYWORDS = [
  "מיזם", "סטארטאפ", "שוק", "מוצר", "business", "saas", "plan",
  "תוכנית עסקית", "אסטרטגיה", "מודל כלכלי", "השקעה", "שיווק",
  "startup", "market", "product", "venture", "investment",
];

export interface ScoutReport {
  market_trends: string[];
  scqa_formulation: {
    Situation: string;
    Complication: string;
    Question: string;
    Answer_Hypothesis: string;
  };
  expert_directive: string;
}

export function shouldTriggerScout(input: string): boolean {
  const wordCount = input.trim().split(/\s+/).length;
  if (wordCount < 15) return true;
  const lower = input.toLowerCase();
  return SCOUT_BUSINESS_KEYWORDS.some(kw => lower.includes(kw));
}

export async function runContextScout(userInput: string): Promise<ScoutReport | null> {
  try {
    const savedGoogleKey = process.env.GOOGLE_API_KEY;
    if (savedGoogleKey) delete process.env.GOOGLE_API_KEY;
    const ai = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
    });
    if (savedGoogleKey) process.env.GOOGLE_API_KEY = savedGoogleKey;

    let searchResults = "";
    try {
      const searchResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `What are the top 3 industry trends for 2026 related to: "${userInput}"? Provide concise, factual trends with brief explanations. Focus on market data, technology shifts, and consumer behavior changes.` }] }],
        config: {
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 500,
          temperature: 0.3,
        },
      });
      searchResults = searchResponse.text || "";
      console.log(`[הגשש] Google Search grounding succeeded: ${searchResults.substring(0, 100)}...`);
    } catch (searchErr) {
      console.warn("[הגשש] Google Search grounding failed, using model knowledge:", searchErr);
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `Based on your knowledge, what are the top 3 industry trends for 2026 related to: "${userInput}"? Be specific and factual. Focus on real market data, technology shifts, and consumer behavior.` }] }],
        config: {
          maxOutputTokens: 500,
          temperature: 0.3,
        },
      });
      searchResults = fallbackResponse.text || "";
      console.log(`[הגשש] Fallback model response: ${searchResults.substring(0, 100)}...`);
    }

    if (!searchResults || searchResults.length < 20) {
      console.warn("[הגשש] Insufficient search results, skipping Scout");
      return null;
    }

    const synthesisPrompt = `You are the Context Scout (הגשש ההקשרי). Your job is to synthesize web search findings into a structured Ground Truth report.

User's input: "${userInput}"

Search findings:
${searchResults}

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences):
{
  "market_trends": ["Trend 1 description", "Trend 2 description", "Trend 3 description"],
  "scqa_formulation": {
    "Situation": "Current state of the market/industry in Hebrew",
    "Complication": "The core challenge or disruption in Hebrew",
    "Question": "The key strategic question in Hebrew",
    "Answer_Hypothesis": "Initial strategic direction in Hebrew"
  },
  "expert_directive": "Specific focus instruction for the expert cabinet in Hebrew"
}

Rules:
- market_trends: exactly 3 trends, each MAX 15 words in Hebrew
- scqa_formulation: all fields in Hebrew, each MAX 20 words
- expert_directive: one short sentence in Hebrew, MAX 15 words
- Keep total output compact - under 500 characters
- Output MUST be pure JSON, no explanation, no markdown`;

    const responseSchema = {
      type: "object" as const,
      properties: {
        market_trends: { type: "array" as const, items: { type: "string" as const } },
        scqa_formulation: {
          type: "object" as const,
          properties: {
            Situation: { type: "string" as const },
            Complication: { type: "string" as const },
            Question: { type: "string" as const },
            Answer_Hypothesis: { type: "string" as const },
          },
          required: ["Situation", "Complication", "Question", "Answer_Hypothesis"],
        },
        expert_directive: { type: "string" as const },
      },
      required: ["market_trends", "scqa_formulation", "expert_directive"],
    };

    let report: ScoutReport | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const synthesisResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema,
            maxOutputTokens: 4000,
            temperature: 0.2,
          },
        });

        const rawJson = synthesisResponse.text || "";
        console.log(`[הגשש] Raw synthesis JSON (${rawJson.length} chars): ${rawJson.substring(0, 200)}...`);
        const cleaned = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
        try {
          report = JSON.parse(cleaned);
        } catch (parseErr) {
          const repaired = cleaned
            .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === "\n" || ch === "\r" || ch === "\t" ? ch : "")
            .replace(/,\s*([}\]])/g, "$1")
            .trim();
          report = JSON.parse(repaired);
          console.log("[הגשש] JSON repair succeeded");
        }
        if (report && report.market_trends && report.market_trends.length > 0) break;
        console.warn(`[הגשש] Attempt ${attempt + 1}: incomplete report, retrying...`);
        report = null;
      } catch (synthErr) {
        console.warn(`[הגשש] Synthesis attempt ${attempt + 1} failed:`, synthErr);
        report = null;
      }
    }

    if (!report) return null;

    if (!report.market_trends || !Array.isArray(report.market_trends) || report.market_trends.length === 0) {
      console.warn("[הגשש] Invalid report structure, missing market_trends");
      return null;
    }
    if (!report.scqa_formulation || !report.expert_directive) {
      console.warn("[הגשש] Invalid report structure, missing required fields");
      return null;
    }

    console.log(`[הגשש] Scout report generated: ${report.market_trends.length} trends, directive: ${report.expert_directive.substring(0, 60)}...`);
    return report;
  } catch (err) {
    console.error("[הגשש] Context Scout failed:", err);
    return null;
  }
}

export function buildScoutInjection(report: ScoutReport): string {
  const trendsBlock = report.market_trends.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return `
[דו"ח הגשש ההקשרי - עובדות בלתי ניתנות לשינוי]
[סטטוס: GROUND TRUTH - אסור לסתור, לשנות, או להתעלם מנתונים אלו]

מגמות שוק 2026:
${trendsBlock}

ניתוח SCQA:
מצב: ${report.scqa_formulation.Situation}
סיבוך: ${report.scqa_formulation.Complication}
שאלה: ${report.scqa_formulation.Question}
השערת כיוון: ${report.scqa_formulation.Answer_Hypothesis}

הנחיית מיקוד לקבינט: ${report.expert_directive}

[איסור חיפוש נוסף]
כל המומחים חייבים לעבוד אך ורק בגבולות הדו"ח הזה. אסור להמציא מגמות, נתונים, או עובדות שאינם מופיעים כאן. הדו"ח הוא מקור האמת היחיד לסבב זה.
`;
}
