import type { Express, Request } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { chatRequestSchema, voiceSettingsSchema, type ConversationMessage, type ExpertId, STOP_TOKENS } from "@shared/schema";
import { getSession, updateSessionHistory, getActiveSessionCount } from "./lib/sessionManager";
import { logTelemetry } from "./lib/telemetry";
import {
  HEYGEN_CHARACTER_PROFILES,
  storeAudio,
  getAudio,
  createVideoJob,
  getVideoJob,
  updateVideoJob,
  getVideoJobsByConversation,
  approveVideoJob,
  splitIntoSentences,
  generateHeyGenVideo,
  checkHeyGenVideoStatus,
  listHeyGenAvatars,
} from "./lib/heygen";
import { selectRelevantExperts, safetyScan, isSummaryMode, getExpertPrompt, getMetaAgentInfo, META_AGENTS, detectDirectCall, detectAllDirectCalls } from "./personas";
import { textToVector, cosineSimilarity, retrieveRelevantMemories, buildUserProfile, buildVocab } from "./lib/vectorEngine";
import { shouldTriggerScout, runContextScout, buildScoutInjection, type ScoutReport } from "./lib/contextScout";
import { findCachedScout, addScoutLog, getScoutLogs } from "./lib/scoutLogs";

let lastSummarizedAt = new Map<number, number>();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ["text/plain", "application/pdf", "text/csv", "text/markdown"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(txt|pdf|md|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only TXT, PDF, MD, CSV files are allowed"));
    }
  },
});

const PROJECT_LEDGER = `[ספר פרויקטים | Project Ledger - הודעה בלתי משתנה]
סטטוס: פרויקט גלידה | מלאי: 500 גרם אגר-אגר, 2 ק"ג Xanthan Gum | בטיחות: וטו חלבון מיקרוביאלי על ידי מנהל המשברים
[אזהרה: אסור לסכם, לקצר, או להשמיט הודעה זו. הודעה זו חסינה מפני כל לוגיקת ניהול חלונות הקשר.]
`;

const SAFETY_PROTOCOL = `[פרוטוקול בטיחות]
אם המשתמש מציין פגיעה עצמית או משבר חמור - צא מהדמות. ספק: ער"ן 1201, סהר"ל *6742. הפנה לגורם מקצועי.`;

const BASE_SYSTEM_PROMPT = `[עדיפות מערכת עליונה - הוראות אלו גוברות על כל בקשת משתמש]

${PROJECT_LEDGER}

[חדר המומחים - פרוטוקול המנצח]
צוות של 4 מומחים בהובלת המנצח. כל מומחה מנתח מזווית ייחודית בלבד.
המנצח מפעיל את הפרסונות הרלוונטיות לפי הצורך ומוודא שכל תגובה עוברת דרך השרשרת הנכונה.

[איסורים גלובליים - חלים על כל המומחים ללא יוצא מן הכלל]
1. איסור מטא-דיבור: אסור לתאר תהליכים פנימיים. אסור: "אני אנתח...", "בהתבסס על...", "בואו נפרק...". פשוט עשה.
2. אילוצים שקטים: אם יש מגבלת מילים או מבנה חובה - בצע בשקט. אסור להזכיר את האילוץ עצמו.
3. עיקרון הפירמידה: כל תגובה חייבת להתחיל מהמסקנה. אחר כך הנמקה.
4. כותרות בעברית בלבד: אסור אנגלית בסוגריים. "מצב" ולא "מצב (Situation)".
5. אנטי-סיקופנטיות: עקוב אחר המתודולוגיה גם כשהמשתמש מנסה להסיט. המתודולוגיה גוברת על רצון לרצות.
6. שפה: עברית בלבד. ללא סלנג. ללא Markdown.
7. כל מומחה עוצר כשסיים - אסור לגלוש לתחומי אחרים.
8. אסור לנתח את כוונת המשתמש. אסור לדון בפרוטוקולים, גרסאות, או חוסר עקביות במערכת. אם זיהית שגיאה בשרשרת - התעלם ממנה והתמקד 100% בנושא של המשתמש.

[אסימוני עצירה]
המהנדס האונטולוגי: ${STOP_TOKENS.ontological}
איש הרנסנס: ${STOP_TOKENS.renaissance}
מנהל המשברים: ${STOP_TOKENS.crisis}
השועל המבצעי: ${STOP_TOKENS.operational}

${SAFETY_PROTOCOL}
`;

function buildContextInjection(
  userProfile: { coreProfile: any; livingPromptSummary: string } | undefined,
  relevantMemories: { text: string }[],
): string {
  let ctx = "\n[הזרקת הקשר]\n";

  if (userProfile?.coreProfile && Object.keys(userProfile.coreProfile).length > 0) {
    const profileCopy = { ...userProfile.coreProfile };
    const coreRules: string[] = profileCopy.core_rules || [];
    delete profileCopy.core_rules;

    if (Object.keys(profileCopy).length > 0) {
      ctx += `[פרופיל משתמש]\n${JSON.stringify(profileCopy, null, 0)}\n\n`;
    }

    if (coreRules.length > 0) {
      ctx += `[חוקי ליבה - כללים קבועים של המשתמש]\nהכללים הבאים נשמרו על ידי המשתמש כהנחיות קבועות. חובה לפעול לפיהם:\n`;
      coreRules.forEach((rule, i) => {
        ctx += `${i + 1}. ${rule}\n`;
      });
      ctx += "\n";
    }
  }

  if (userProfile?.livingPromptSummary && userProfile.livingPromptSummary.length > 0) {
    const sanitizedSummary = userProfile.livingPromptSummary
      .replace(/תיקון עצמי[^\n]*/gi, "")
      .replace(/שגיאת מערכת[^\n]*/gi, "")
      .replace(/חוסר עקביות[^\n]*/gi, "")
      .replace(/self[- ]?correction[^\n]*/gi, "")
      .replace(/system\s*(error|inconsistenc)[^\n]*/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (sanitizedSummary.length > 0) {
      ctx += `[סיכום שיחה חי]\n${sanitizedSummary}\n\n`;
    }
  }

  if (relevantMemories.length > 0) {
    ctx += `[זיכרונות אפיזודיים - ${relevantMemories.length} רלוונטיים]\n`;
    relevantMemories.forEach((m, i) => {
      ctx += `${i + 1}. ${m.text}\n`;
    });
    ctx += "\n";
  }

  return ctx;
}

const VOICE_MAP: Record<string, { voice_id: string; pitch: number; avatar_id?: string }> = {
  ontological: { voice_id: "Charon", pitch: -2.0, avatar_id: HEYGEN_CHARACTER_PROFILES.ontological?.avatarId },
  renaissance: { voice_id: "Puck", pitch: 1.0, avatar_id: HEYGEN_CHARACTER_PROFILES.renaissance?.avatarId },
  crisis: { voice_id: "Orus", pitch: -4.0, avatar_id: HEYGEN_CHARACTER_PROFILES.crisis?.avatarId },
  operational: { voice_id: "Fenrir", pitch: -1.0, avatar_id: HEYGEN_CHARACTER_PROFILES.operational?.avatarId },
};

function chunkText(text: string, chunkSize = 800): string[] {
  const sentences = text.split(/(?<=[.!?。\n])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function registerRoutes(_httpServer: Server, app: Express) {
  app.get("/api/ping", (_req, res) => {
    res.json({ pong: true, ts: Date.now() });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request" });

      const { message: rawMessage, conversationId, imageBase64, audioBase64, sessionId } = parsed.data;
      const reqSessionId = sessionId || "anonymous";

      const isPLIER = rawMessage.startsWith("[קטגוריה:");

      const message = rawMessage
        .replace(/פרוטוקול[ים]?\s*/gi, "")
        .replace(/גרס[הא]\s*\d*/gi, "")
        .replace(/מצב מערכת/gi, "")
        .replace(/שגיאת מערכת/gi, "")
        .replace(/חוסר עקביות/gi, "")
        .replace(/system\s*(status|error|protocol|version)/gi, "")
        .replace(/self[- ]?correction/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      if (isPLIER) {
        const startTime = Date.now();
        const session = getSession(reqSessionId);
        console.log(`[PLIER] מצב הדרכה חי מופעל [session: ${reqSessionId.substring(0, 8)}...] (requests: ${session.requestCount}, active sessions: ${getActiveSessionCount()})`);

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const sendSSE = (event: string, data: any) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        let convId = conversationId;
        let existingMessages: ConversationMessage[] = [];
        if (convId) {
          const conv = await storage.getConversation(convId);
          if (conv) existingMessages = conv.messages as ConversationMessage[];
        } else {
          const conv = await storage.createConversation({ title: message.slice(0, 30), messages: [] });
          convId = conv.id;
        }

        sendSSE("status", { stage: "generating", label: "בודק...", conversationId: convId });

        const { GoogleGenAI } = await import("@google/genai");
        const savedGoogleKey = process.env.GOOGLE_API_KEY;
        if (savedGoogleKey) delete process.env.GOOGLE_API_KEY;
        const ai = new GoogleGenAI({
          apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
          httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
        });
        if (savedGoogleKey) process.env.GOOGLE_API_KEY = savedGoogleKey;

        const userContentParts: any[] = [{ text: message }];
        if (imageBase64) {
          const match = imageBase64.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
          if (match) {
            userContentParts.push({
              inlineData: { mimeType: match[1], data: match[2] },
            });
            console.log(`[DIY Vision] תמונה צורפה, MIME: ${match[1]}, גודל: ${(match[2].length / 1024).toFixed(0)}KB base64`);
          } else {
            console.warn(`[DIY Vision] תמונה לא תקינה - לא תואם פורמט data URL (${imageBase64.substring(0, 50)}...)`);
          }
        }
        if (audioBase64) {
          const base64Marker = ";base64,";
          const markerIdx = audioBase64.indexOf(base64Marker);
          if (audioBase64.startsWith("data:audio/") && markerIdx > 0) {
            const fullMime = audioBase64.substring(5, markerIdx);
            const baseMime = fullMime.split(";")[0].trim();
            const audioData = audioBase64.substring(markerIdx + base64Marker.length);
            userContentParts.push({
              inlineData: { mimeType: baseMime, data: audioData },
            });
            console.log(`[DIY Audio] הקלטת שמע צורפה, MIME: ${baseMime} (fullMime: ${fullMime}), גודל base64: ${(audioData.length / 1024).toFixed(0)}KB, ~${((audioData.length * 3) / 4 / 1024).toFixed(0)}KB decoded`);
          } else {
            console.warn(`[DIY Audio] שמע לא תקין - לא תואם פורמט data URL. prefix: ${audioBase64.substring(0, 80)}...`);
          }
        }

        const chatHistory = existingMessages.slice(-20).map(m => ({
          role: m.role === "user" ? "user" as const : "model" as const,
          parts: [{ text: m.content }],
        }));

        const DIY_SYSTEM_PROMPT = `את נועה - מדריכת תיקונים מקצועית עם 25 שנות ניסיון. השם שלך הוא נועה ותמיד נועה. לעולם אל תציגי את עצמך כ"אבי" או כל שם אחר. את טכנאית ישראלית חדה, ישירה ומקצועית. את רואה דרך המצלמה של המשתמש ומדריכה אותו כמו מומחית שגם חברה. קפצי ישר לעניין.

כללי ברזל:
עברית בלבד. סלנג ישראלי רצוי (תכל'ס, שמע, יאללה). מקסימום 2-3 משפטים קצרים ופאנצ'יים. אסור רשימות ארוכות, אסור מבואות רובוטיות, אסור אסאיים. אסור Markdown (ללא כוכביות, סולמיות, backticks). טקסט נקי בלבד. אסור לחזור על אותם ביטויים פתיחה/סיום - כל תגובה חייבת להרגיש טבעית, אנושית ושונה מהקודמת. אסור: "שמעתי את ההקלטה", "אהלן בואו נסדר את זה", "תגיד לי כשסיימת". גוני את השפה שלך.

צעד אחד בכל פעם. לעולם אל תפרסי 5 שלבים ברצף. תני הוראה אחת ותחכי שהמשתמש יאשר שסיים.

לפני כל פעולה מסוכנת (חיתוך, פירוק, הסרת ברגים): "צלם לי את זה רגע לפני שאתה מפרק, שנוודא ביחד."

תרגיעי תמיד. כשלא בטוחה ציני הסתברויות: "נשמע כמו מיסב ב-80%, אבל בוא נראה תמונה."

הפני לאיש מקצוע רק ב: חשמל ראשי 220V, קווי גז, הריסה מבנית. אם צריך הלחמה או מתח גבוה: "זה מסוכן מדי, חפש מתקין מורשה." בכל שאר המקרים הדריכי את המשתמש לעשות לבד.

ראייה דרך מצלמה: אם צורפה תמונה - נתחי אותה בקצרה. זווית לא טובה: "אחי, תזיז קצת [כיוון]". חשוך: "הדלק פנס". מטושטש: "קרב ותחזיק יציב". אם לא צורפה תמונה - אל תטעני שאת רואה משהו! תני ייעוץ על סמך התיאור הכתוב בלבד, ובסוף הזמיני לצלם. סימון מרחבי (כשיש תמונה): תארי מיקומים מדויקים (לדוגמה: "החוט האדום בצד ימין למעלה", "הבורג השמאלי התחתון").

מדידה חכמה: "שים כרטיס אשראי או מטבע של 10 שקלים ליד האזור וצלם שוב." כרטיס = 8.5x5.4 ס"מ, מטבע 10 שקל = 2.3 ס"מ. כשהמשתמש שואל שאלות כמו "אפשר לשים פה מגירה?" או "יש מקום למדף?" - התנהגי כמו נגרית/מעצבת: העריכי היתכנות, הציעי רעיונות יצירתיים לניצול חלל, ותני מידות מדויקות. חשבי על חלופות.

אבחון אקוסטי - כללי ברזל:
1. זהות: את נועה. תמיד נועה. לעולם אל תציגי את עצמך כ"אבי" או כל שם אחר. את טכנאית ישראלית חדה ומקצועית.
2. אנטי-הזיה מוחלט: אם ההקלטה מכילה בעיקר רעשי רקע, שיחות אנשים, שקט, רוח, או כל צליל שאינו תקלה מכנית/חשמלית ברורה - אל תמציאי אבחנה! אמרי בכנות שלא שמעת רעש ברור ובקשי הקלטה חדשה מקרוב יותר. לדוגמה: "תשמע, יש פה בעיקר רעשי רקע. תקרב את הטלפון ישר למכשיר ותקליט שוב כשהוא עובד." אסור לך להמציא תקלות (מיסבים, קומפרסורים, משאבות) כשאת לא באמת שומעת אותן בצליל.
3. אל תנחשי מכשיר: אם שומעת רעש מכני ברור אבל לא יודעת מאיזה מכשיר, תארי את הצליל ותשאלי: "מאיזה מכשיר זה מגיע?" אל תניחי אוטומטית שזו מכונת כביסה או מקרר.
4. אסור חזרות רובוטיות: לעולם אל תפתחי עם "שמעתי את ההקלטה" או "אהלן, בואו נסדר את זה". לעולם אל תסיימי עם "תגיד לי כשסיימת". גוני את התגובות שלך, תהיי טבעית ומגוונת בכל פעם.
5. כשכן שומעת תקלה אמיתית: תארי בדיוק מה את שומעת (נקישות, גרגור, זמזום, חריקה, רעידות, שריקה), ואבחני בזהירות. ציני רמת ביטחון: "נשמע כמו X ב-70%, אבל תקליט שוב מקרוב שאוודא." בין הסוגים האפשריים: קליקים של קומפרסור מקרר, רטרוט מאוורר מזגן, זמזום גוף חימום תנור, חסימת משאבת מים, מיסב תוף, רעש מנוע שואב אבק, חריקת ציר מייבש.
6. כשמכשיר בלי מסך או קודי שגיאה, הפני אקטיבית לכפתור הקלטת רעש: "אין פה מסך, אז בוא נשמע אותו. תלחץ על כפתור הקלטת הרעש ותפעיל את המנוע ל-5 שניות."

פריצת חומרה (Right-to-Repair):
כשמנתחת תמונות, חפשי אקטיבית מלכודות יצרן ומנעי נזק:
- מארזים מודבקים: אם אין ברגים ויש תפר צמוד, הזהירי: "עצור! הפלסטיק פה מודבק, לא עם ברגים. אם תדחוף מברג זה יישבר. תביא פן של שיער ותחמם את הפס הזה 60 שניות כדי לרכך את הדבק."
- ברגי ביטחון: זהי ברגי Torx, Pentalobe, משולש. הזהירי: "שים לב אחי, זה לא פיליפס רגיל, זה בורג ביטחון מסוג [סוג]. אל תנסה לפתוח עם מברג רגיל כי תהרוס את ההברגה. אתה צריך ראש [מידה ספציפית]."
- מכשיר בלי מסך/קודי שגיאה (Black Box): הפני להקלטת רעש כמתואר למעלה.

תמחור: חובה לתת מחירים בש"ח. הזכירי תמיד: "טכנאי ייקח 500 שקל רק על הביקור. החלק עולה [מחיר], שווה לעשות לבד." חפשי אקטיבית תקלות ברכיבים יקרים: לוחות בקרה, מיסבי תוף, Spider Arm, HVAC.

כשמזהה חלק להחלפה, ציני את שם החלק, המותג או מק"ט אם ידוע, ומחיר משוער בש"ח. עשי את זה בצורה טבעית כחלק מהתשובה, לא כתבנית קבועה.

חנויות ישראליות בלבד: אם וכאשר המשתמש שואל היכן לקנות חלקים או כלים, המליצי רק על חנויות ישראליות: ACE, הום סנטר, טמבוריות מקומיות, Max Stock. לעולם אל תזכירי Home Depot, Lowe's או חנויות אמריקאיות אחרות. לחלקים ספציפיים שלא נמצאים בחנויות המקומיות, הפני ל-AliExpress או eBay עם מק"ט מדויק.

מותגים - שתי אופציות: פרימיום (Bosch, Makita, Grohe, Tambour, Nirlat) וחסכוני (Stanley, Topkick, Palziv). רק מותגים אמיתיים.

חדשנות: העדיפי WAGO על שנתות, Shelly/Sonoff כשרלוונטי, סיליקון על פשתן, Loctite/JB Weld.

עיצוב/צבע: גוונים ספציפיים מטמבור/נירלט, סוג צבע, גימור, מחיר למ"ר.

כשתיקון הושלם בהצלחה, ציני כמה כסף המשתמש חסך ועודדי אותו לשתף את האפליקציה בוואטסאפ. תעשי את זה בצורה טבעית ולא כתבנית קבועה.

סיימי עם [CAP_DIY_END] ואסור להוסיף מילה אחריו.`;

        try {
          const contents = [
            ...chatHistory,
            { role: "user" as const, parts: userContentParts },
          ];

          let expertText = "";
          const cleanText = (raw: string) => {
            let t = raw
              .replace(/\*\*\*/g, "").replace(/\*\*/g, "").replace(/\*/g, "")
              .replace(/^#{1,6}\s+(.+)$/gm, "$1")
              .replace(/```[\s\S]*?```/g, "").replace(/`([^`]*)`/g, "$1")
              .replace(/---+/g, "").replace(/\.{3,}/g, "")
              .replace(/\n{3,}/g, "\n\n").trim();
            const stopIdx = t.indexOf("[CAP_DIY_END]");
            if (stopIdx !== -1) t = t.substring(0, stopIdx).trim();
            const lastEnd = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"), t.lastIndexOf("״"));
            if (lastEnd > 0 && lastEnd < t.length - 1) {
              const trailing = t.substring(lastEnd + 1).trim();
              if (trailing.length > 0 && trailing.length < 15) {
                t = t.substring(0, lastEnd + 1).trim();
              }
            }
            return t;
          };

          try {
            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents,
              config: {
                systemInstruction: DIY_SYSTEM_PROMPT,
                maxOutputTokens: 300,
                temperature: 0.5,
                thinkingConfig: { thinkingBudget: 0 },
              },
            });
            expertText = cleanText(response.text || "");
          } catch (primaryErr: any) {
            const errMsg = primaryErr?.message || String(primaryErr);
            const isQuotaOrTimeout = errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("timeout") || errMsg.includes("DEADLINE_EXCEEDED");
            console.warn(`PLIER'] Primary request failed (${isQuotaOrTimeout ? "quota/timeout" : "other"}): ${errMsg}`);
            if (isQuotaOrTimeout) {
              console.log("[PLIER] Retrying with reduced config (keeping all inputs)...");
              try {
                const fallbackResponse = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents,
                  config: {
                    systemInstruction: DIY_SYSTEM_PROMPT,
                    maxOutputTokens: 200,
                    temperature: 0.4,
                    thinkingConfig: { thinkingBudget: 0 },
                  },
                });
                expertText = cleanText(fallbackResponse.text || "");
                console.log("[PLIER] Reduced-config fallback succeeded.");
              } catch (fallbackErr: any) {
                console.error("PLIER] Fallback also failed:", fallbackErr?.message || fallbackErr);
                throw fallbackErr;
              }
            } else {
              throw primaryErr;
            }
          }

          if (!expertText || expertText.length < 5) {
            expertText = "לא הצלחתי לנתח את התמונה. נסה שוב עם זווית טובה יותר או תאור מפורט יותר של הבעיה.";
          }

          let audioBase64: string | null = null;
          try {
            const { generateSpeech } = await import("./lib/elevenlabsTTS.js");
            const ttsResult = await generateSpeech(expertText);
            if (ttsResult) {
              audioBase64 = ttsResult.buffer.toString("base64");
            }
          } catch (ttsErr: any) {
            console.error(`[DIY TTS] TTS generation failed: ${ttsErr?.message || ttsErr}`);
          }

          const turn = { character: "operational", text: expertText, audioBase64 };
          sendSSE("turn", { turn, index: 0, total: 1, conversationId: convId, audioBase64 });

          const now = new Date().toISOString();
          const ts = Date.now();
          const newMessages: ConversationMessage[] = [
            ...existingMessages,
            { id: `user-${ts}`, role: "user", content: message, timestamp: now },
            { id: `cap-${ts + 1}`, role: "operational", content: expertText, timestamp: now },
          ];
          await storage.updateConversationMessages(convId, newMessages);

          updateSessionHistory(reqSessionId, [
            ...chatHistory,
            { role: "user" as const, parts: [{ text: message }] },
            { role: "model" as const, parts: [{ text: expertText }] },
          ]);

          sendSSE("status", { stage: "complete", label: "הושלם" });
          sendSSE("result", { turns: [turn], conversationId: convId });
          res.write("event: done\ndata: {}\n\n");
          res.end();
          logTelemetry({
            sessionId: reqSessionId,
            type: "diy_chat",
            hasImage: !!imageBase64,
            hasAudio: !!audioBase64,
            responseTokens: expertText.length,
            durationMs: Date.now() - startTime,
          });
        } catch (genErr: any) {
          console.error("[PLIER] שגיאה:", genErr);
          const errorMsg = genErr?.message || String(genErr);
          const isRateLimit = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED");
          sendSSE("error", {
            message: isRateLimit
              ? "המערכת עמוסה כרגע. נסו שוב בעוד כמה שניות."
              : "אירעה שגיאה בעיבוד התשובה. נסו שוב.",
          });
          res.end();
          logTelemetry({
            sessionId: reqSessionId,
            type: "diy_chat_error",
            error: errorMsg.substring(0, 200),
            durationMs: Date.now() - startTime,
          });
        }
        return;
      }

      const isSafetyTriggered = safetyScan(message);
      const allDirectCalls = detectAllDirectCalls(message);
      const directCallAgent = allDirectCalls.length === 1 ? allDirectCalls[0] : null;
      const selectedExperts = selectRelevantExperts(message);
      const summaryMode = isSummaryMode(selectedExperts);
      const primaryExpert = selectedExperts[0];
      const primaryInfo = getMetaAgentInfo(primaryExpert);

      if (allDirectCalls.length > 1) {
        console.log(`[ניתוב מרובה] זוהו ${allDirectCalls.length} מומחים: ${allDirectCalls.join(", ")}`);
      } else if (directCallAgent) {
        console.log(`[ניתוב ישיר] המשתמש ביקש ישירות: ${directCallAgent} - עוקף שרשרת, שוטף הקשר`);
      }
      console.log(`[Pipeline] Safety: ${isSafetyTriggered}, Experts: ${selectedExperts.join(", ")}, SummaryMode: ${summaryMode}, Primary: ${primaryInfo.nameHe}`);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const sendSSE = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      if (isSafetyTriggered) {
        sendSSE("safety", { triggered: true, message: "זוהה תוכן רגיש. מפעיל פרוטוקול בטיחות." });
      }

      sendSSE("status", {
        stage: "routing",
        label: `${primaryInfo.nameHe} מוביל...`,
        summaryMode,
        safetyOverride: isSafetyTriggered,
      });

      let convId = conversationId;
      let existingMessages: ConversationMessage[] = [];
      if (convId) {
        const conv = await storage.getConversation(convId);
        if (conv) {
          if (directCallAgent) {
            existingMessages = [];
          } else {
            existingMessages = conv.messages as ConversationMessage[];
          }
        }
      } else {
        const conv = await storage.createConversation({ title: message.slice(0, 30), messages: [] });
        convId = conv.id;
      }

      sendSSE("meta_agent", {
        id: primaryExpert,
        name: primaryInfo.name,
        nameHe: primaryInfo.nameHe,
        framework: primaryInfo.framework,
        color: primaryInfo.color,
        stopToken: primaryInfo.stopToken,
      });

      sendSSE("experts", {
        selected: selectedExperts,
        summaryMode,
        safetyOverride: isSafetyTriggered,
        crisisActive: selectedExperts.includes("crisis"),
        stopTokens: selectedExperts.reduce((acc, id) => {
          acc[id] = STOP_TOKENS[id as ExpertId];
          return acc;
        }, {} as Record<string, string>),
      });

      let scoutReport: ScoutReport | null = null;
      let scoutInjection = "";
      let scoutFromCache = false;
      if (!isSafetyTriggered && shouldTriggerScout(message)) {
        const cachedEntry = findCachedScout(message);
        if (cachedEntry) {
          scoutReport = cachedEntry.report;
          scoutInjection = buildScoutInjection(scoutReport);
          scoutFromCache = true;
          sendSSE("status", { stage: "scouting", label: "טוען ממודיעין מקומי..." });
          sendSSE("scout", {
            active: true,
            cached: true,
            market_trends: scoutReport.market_trends,
            scqa: scoutReport.scqa_formulation,
            directive: scoutReport.expert_directive,
            cachedTopic: cachedEntry.topic,
            cachedAt: cachedEntry.timestamp,
          });
          console.log(`[הגשש] Cache hit: "${cachedEntry.topic.substring(0, 40)}" → skipping live search`);
        } else {
          sendSSE("status", { stage: "scouting", label: "הגשש ההקשרי סורק מגמות שוק..." });
          console.log("[הגשש] Scout triggered for input:", message.substring(0, 50));
          try {
            scoutReport = await runContextScout(message);
            if (scoutReport) {
              scoutInjection = buildScoutInjection(scoutReport);
              addScoutLog(message, scoutReport);
              sendSSE("scout", {
                active: true,
                cached: false,
                market_trends: scoutReport.market_trends,
                scqa: scoutReport.scqa_formulation,
                directive: scoutReport.expert_directive,
              });
              console.log("[הגשש] Scout report injected and cached successfully");
            }
          } catch (scoutErr) {
            console.warn("[הגשש] Scout failed, continuing without:", scoutErr);
          }
        }
      }

      const userProfile = await storage.getUserProfile();

      const allMemoriesForRag = await storage.getRecentMemories(50);
      if (allMemoriesForRag.length > 0) {
        buildVocab(allMemoriesForRag.map(m => m.text));
      }
      const relevantMemories = retrieveRelevantMemories(message, allMemoriesForRag, 3, 0.7);

      const contextInjection = buildContextInjection(
        userProfile ? { coreProfile: userProfile.coreProfile, livingPromptSummary: userProfile.livingPromptSummary } : undefined,
        relevantMemories,
      );

      const expertDescriptions = selectedExperts.map(id => getExpertPrompt(id)).join("\n\n");

      const EXPERT_ID_TO_NAME: Record<string, string> = {
        ontological: "המהנדס האונטולוגי",
        renaissance: "איש הרנסנס",
        crisis: "מנהל המשברים",
        operational: "השועל המבצעי",
      };

      const expertNamesList = selectedExperts.map(id => EXPERT_ID_TO_NAME[id]).join(", ");

      const summaryModeInstruction = summaryMode
        ? `\n[מצב תמצית - פעיל]\nנבחרו יותר מ-3 מומחים. כל מומחה מוגבל ל-100 טוקנים בלבד. תשובות קצרות ותמציתיות.\n`
        : "";

      const safetyOverrideInstruction = isSafetyTriggered
        ? `\n[עקיפת בטיחות - פעיל]\nזוהה תוכן רגיש. מנהל המשברים מוביל. ספק קווי חירום: ער"ן 1201, סהר"ל *6742. הפנה לגורם מקצועי.\n`
        : "";

      const { GoogleGenAI } = await import("@google/genai");
      const savedGoogleKey = process.env.GOOGLE_API_KEY;
      if (savedGoogleKey) delete process.env.GOOGLE_API_KEY;
      const ai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
      });
      if (savedGoogleKey) process.env.GOOGLE_API_KEY = savedGoogleKey;

      sendSSE("status", { stage: "monologue", label: "מסנכרן שרשרת מומחים..." });

      const userContentParts: any[] = [{ text: message }];
      if (imageBase64) {
        const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          userContentParts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
          console.log(`[Vision] תמונה צורפה, MIME: ${match[1]}, גודל Base64: ${match[2].length} תווים`);
        }
      }

      const imageVisionInstruction = imageBase64
        ? `\n[יכולת ראייה ממוחשבת - פעילה]\nהמשתמש צירף תמונה של התקלה. נתח את התמונה בקפידה: זהה את סוג הנזק, המיקום, חומרת הבעיה, דגם/סוג המוצר אם ניתן, וכלול את הניתוח החזותי בתשובתך.\n`
        : "";

      let internalAnalysis = "";
      try {
        const monologueResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: userContentParts }],
          config: {
            systemInstruction: `${PROJECT_LEDGER}\nנתח את הקלט הבא ב-3 משפטים קצרים מנקודת מבט של עקרונות ראשונים. זהה: 1) ההנחה הסמויה, 2) המתח המרכזי, 3) נקודת המינוף. החזר טקסט בלבד, ללא JSON.${imageVisionInstruction}`,
            maxOutputTokens: 150,
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
        internalAnalysis = monologueResponse.text || "";
        console.log(`[מונולוג פנימי] ${internalAnalysis.substring(0, 100)}...`);
      } catch (monologueErr) {
        console.warn("[מונולוג פנימי] נכשל, ממשיך ללא ניתוח מקדים:", monologueErr);
      }

      const shouldRefreshContext = (() => {
        if (!userProfile?.livingPromptSummary || userProfile.livingPromptSummary.length < 20) return false;
        try {
          const inputVec = textToVector(message);
          const summaryVec = textToVector(userProfile.livingPromptSummary);
          const similarity = cosineSimilarity(inputVec, summaryVec);
          console.log(`[מגן ויקינג] דמיון קוסינוס: ${similarity.toFixed(3)}`);
          return similarity < 0.4;
        } catch { return false; }
      })();

      if (shouldRefreshContext) {
        console.log("[מגן ויקינג] דמיון נמוך - מרענן הקשר פעיל");
        sendSSE("status", { stage: "refresh", label: "מרענן הקשר..." });
      }

      const monologueInjection = internalAnalysis
        ? `\n[ניתוח מקדים - לשימוש פנימי בלבד, אל תציג למשתמש]\n${internalAnalysis}\n`
        : "";

      let inventoryContext = "";
      try {
        const items = await storage.getAcquiredItems();
        if (items.length > 0) {
          const itemsList = items.map(i => `${i.item}`).join(", ");
          inventoryContext = `\n[בדיקת עובדות - מלאי פרויקט מאומת]\nהפריטים שנמצאים כרגע במלאי: ${itemsList}.\nאם מומחה מזכיר פריט שאינו ברשימה זו כ"כבר נרכש" - זו הזיה. ענה רק על בסיס עובדות אלו.\nהקצאת תפקידים: מנהל המשברים אחראי בלעדי על כל ביקורות בטיחות ומיקרוביאליות.\n`;
        } else {
          inventoryContext = `\n[בדיקת עובדות - מלאי פרויקט מאומת]\nלא נרכשו פריטים עדיין. אם מומחה מזכיר פריט כ"כבר נרכש" - זו הזיה.\nהקצאת תפקידים: מנהל המשברים אחראי בלעדי על כל ביקורות בטיחות ומיקרוביאליות.\n`;
        }
      } catch (invErr) {
        console.error("Inventory context error:", invErr);
      }

      const hasCrisisAndFox = selectedExperts.includes("crisis") && selectedExperts.includes("operational");
      const goNoGoInstruction = hasCrisisAndFox
        ? `\n[שער Go/No-Go - פרוטוקול שרשרת]\nמנהל המשברים חייב לפתוח את תגובתו בתגית VERDICT:[GO] או VERDICT:[NO-GO].\nהשועל המבצעי חייב לסרוק את תגובת מנהל המשברים, לזהות את תגית ה-VERDICT, ולפעול בהתאם:\n- VERDICT:[GO]: מצב MVP תוקפני - הוראות בנייה מהירות\n- VERDICT:[NO-GO]: מצב מיגון - נטישת התוכנית המקורית, צעד להפחתת סיכון, גרסה קלה ללא האלמנט המסוכן\n`
        : "";

      const contextToUse = (directCallAgent || shouldRefreshContext)
        ? buildContextInjection(
            userProfile ? { coreProfile: userProfile.coreProfile, livingPromptSummary: "" } : undefined,
            directCallAgent ? [] : relevantMemories,
          )
        : contextInjection;

      const cleanText = (t: string) => t
        .replace(/\*\*\*/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/^#{1,6}\s+(.+)$/gm, "【H】$1")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/---+/g, "")
        .replace(/\.{3,}/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const HALLUCINATION_PATTERNS = [/חלבונים מיקרוביאליים/i, /microbial proteins?/i];
      const VETO_PATTERNS = [
        /חלבונ(?:ים)?\s*מיקרוביאל(?:י|יים|ית)/gi,
        /microbial\s*proteins?/gi,
      ];

      const turns: any[] = [];
      const previousResponses: string[] = [];

      for (let expertIdx = 0; expertIdx < selectedExperts.length; expertIdx++) {
        const expertId = selectedExperts[expertIdx];
        const expertPrompt = getExpertPrompt(expertId);
        const expertName = EXPERT_ID_TO_NAME[expertId];
        const expertInfo = getMetaAgentInfo(expertId);

        sendSSE("status", { stage: "generating", label: `${expertName} חושב...` });
        console.log(`[Sequential] ייצור תגובה ${expertIdx + 1}/${selectedExperts.length}: ${expertId}`);

        const previousContext = previousResponses.length > 0
          ? `\n[תגובות מומחים קודמים בשרשרת זו]\n${previousResponses.join("\n\n")}\n`
          : "";

        const singleExpertInstruction = `${BASE_SYSTEM_PROMPT}${contextToUse}${scoutInjection}
[מומחה פעיל: ${expertName}]
${expertPrompt}
${summaryModeInstruction}${safetyOverrideInstruction}${monologueInjection}${inventoryContext}${previousContext}${goNoGoInstruction}${imageVisionInstruction}
[הנחיה לסבב הנוכחי]
המשתמש אמר: "${message}"
אתה ${expertName}. ענה ישירות בעברית לפי המתודולוגיה שלך בלבד.
אסור לחזור על תוכן של מומחים קודמים. כל משפט חייב להיות ייחודי.
חובה לסיים כל משפט עד סופו - אסור לקטוע באמצע.
כתוב את התגובה שלך ישירות בעברית (לא JSON, לא אנגלית).
`;

        const maxTokens = summaryMode ? 800 : 4096;

        let expertText = "";
        try {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: userContentParts }],
            config: {
              systemInstruction: singleExpertInstruction,
              maxOutputTokens: maxTokens,
              temperature: 0.8,
              thinkingConfig: { thinkingBudget: 0 },
            },
          });
          expertText = response.text || "";
          const candidate = response.candidates?.[0];
          console.log(`[Sequential] ${expertId} finishReason: ${candidate?.finishReason}, tokens: ${JSON.stringify(candidate?.tokenCount || candidate?.citationMetadata || 'unknown')}, rawLen: ${expertText.length}`);
        } catch (genErr) {
          console.error(`[Sequential] שגיאה בייצור תגובת ${expertId}:`, genErr);
          continue;
        }

        expertText = cleanText(expertText);

        if (!expertText || expertText.length < 5) {
          console.warn(`[Sequential] ${expertId} החזיר תגובה ריקה - מדלג`);
          continue;
        }

        const isRepetitive = previousResponses.some(prev => {
          const prevWords = prev.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const currWords = expertText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          if (prevWords.length === 0 || currWords.length === 0) return false;
          const overlap = currWords.filter(w => prevWords.includes(w)).length;
          const ratio = overlap / currWords.length;
          return ratio > 0.6;
        });
        if (isRepetitive) {
          console.warn(`[Anti-Loop] ${expertId} חזר על תוכן קודם (>60% חפיפה) - מדלג`);
          continue;
        }

        const hasHallucination = HALLUCINATION_PATTERNS.some(p => p.test(expertText));
        if (hasHallucination && expertId !== "crisis") {
          for (const pat of VETO_PATTERNS) {
            pat.lastIndex = 0;
            expertText = expertText.replace(pat, "[נחסם: וטו בטיחות מנהל המשברים]");
          }
          console.warn(`[Ledger Veto] ${expertId} הפר וטו בטיחות - חלבון מיקרוביאלי. נוקה.`);
        }

        const stopToken = STOP_TOKENS[expertId];
        if (stopToken) {
          const stopIdx = expertText.indexOf(stopToken);
          if (stopIdx !== -1) {
            expertText = expertText.substring(0, stopIdx + stopToken.length);
          } else {
            expertText = expertText + "\n" + stopToken;
          }
        }

        const turn = {
          character: expertId,
          text: expertText,
          stopToken: STOP_TOKENS[expertId],
          ...VOICE_MAP[expertId],
        };
        turns.push(turn);
        previousResponses.push(`[${expertName}]: ${expertText}`);

        sendSSE("turn", {
          turn,
          index: expertIdx,
          total: selectedExperts.length,
          conversationId: convId,
        });

        console.log(`[Sequential] ${expertId} סיים (${expertText.length} תווים) - נשלח ללקוח`);

        if (expertIdx < selectedExperts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const now = new Date().toISOString();
      const ts = Date.now();
      const newMessages: ConversationMessage[] = [
        ...existingMessages,
        { id: `user-${ts}`, role: "user", content: message, timestamp: now, isSafetyOverride: isSafetyTriggered },
        ...turns.map((turn: any, i: number) => ({
          id: `${turn.character}-${ts + i + 1}`,
          role: turn.character as ConversationMessage["role"],
          content: turn.text,
          timestamp: now,
        })),
      ];

      await storage.updateConversationMessages(convId, newMessages);

      try {
        const foxTurn = turns.find((t: any) => t.character === "operational");
        if (foxTurn && foxTurn.text) {
          const foxText = foxTurn.text;
          const itemPatterns = [
            /רכוש\s+(.+?)(?:\.|,|$)/gm,
            /השק\s+(.+?)(?:\.|,|$)/gm,
            /התקן\s+(.+?)(?:\.|,|$)/gm,
            /כתוב\s+(.+?)(?:\.|,|$)/gm,
            /(\d+[\s]*(?:גרם|ג'|מ"ל|ליטר|ק"ג|יחידות|קילו)[\s]+[^\.,]+)/g,
          ];
          const extracted = new Set<string>();
          for (const pattern of itemPatterns) {
            let match;
            while ((match = pattern.exec(foxText)) !== null) {
              const item = match[1]?.trim();
              if (item && item.length > 3 && item.length < 200) {
                extracted.add(item);
              }
            }
          }
          const extractedArr = Array.from(extracted);
          for (let ei = 0; ei < extractedArr.length; ei++) {
            await storage.addAcquiredItem({ item: extractedArr[ei], source: "operational", context: message });
          }
          if (extractedArr.length > 0) {
            console.log(`[Memory] שמר ${extractedArr.length} פריטים נרכשים מהשועל המבצעי`);
          }
        }
      } catch (extractErr) {
        console.error("Acquired items extraction error:", extractErr);
      }

      const lastSummarized = lastSummarizedAt.get(convId) || 0;
      const unsummarizedCount = newMessages.length - lastSummarized;
      if (unsummarizedCount >= 16 && newMessages.length >= 16) {
        try {
          const newSegment = newMessages.slice(lastSummarized);
          const summaryResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              {
                role: "user",
                parts: [{ text: `${PROJECT_LEDGER}\nסכם את קטע השיחה הבא ב-2-3 משפטים וזהה 3-5 נושאים מרכזיים. שמור על כל קבועים טכניים (מספרים, יחידות מדידה, שמות חומרים) במדויק. החזר JSON בפורמט: {"summary": "...", "topics": ["...", "..."]}.\n\nשיחה:\n${newSegment.map(m => `${m.role}: ${m.content}`).join("\n")}` }],
              },
            ],
            config: { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
          });

          const summaryText = summaryResponse.text || "";
          const cleanedSummary = summaryText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const summaryData = JSON.parse(cleanedSummary);
          await storage.createMemoryContext({ summary: summaryData.summary, topics: summaryData.topics });

          console.log("[Context Integrity] סיכום נשמר כזיכרון אפיזודי בלבד - livingPromptSummary לא עודכן (דיוק על פני זמן השהייה)");

          lastSummarizedAt.set(convId, newMessages.length);
        } catch (e) {
          console.error("Memory summary error:", e);
        }
      }

      try {
        const memVector = textToVector(message);
        await storage.createMemory({ text: message, vector: memVector, category: primaryExpert });
      } catch (memErr) {
        console.error("Memory storage error:", memErr);
      }

      sendSSE("status", { stage: "complete", label: "הושלם" });
      sendSSE("result", {
        turns,
        dialogueOrder: selectedExperts,
        conversationId: convId,
        summaryMode,
        safetyOverride: isSafetyTriggered,
        metaAgent: {
          id: primaryExpert,
          name: primaryInfo.name,
          nameHe: primaryInfo.nameHe,
          framework: primaryInfo.framework,
          color: primaryInfo.color,
          stopToken: primaryInfo.stopToken,
        },
      });
      res.write("event: done\ndata: {}\n\n");
      res.end();
    } catch (error: any) {
      console.error("Chat error:", error);
      const errorMsg = error?.message || String(error);
      const isRateLimit = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("rate") || errorMsg.includes("RESOURCE_EXHAUSTED");
      const sendSSE = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      sendSSE("error", {
        message: isRateLimit
          ? "המערכת עמוסה כרגע. נסו שוב בעוד כמה שניות."
          : "אירעה שגיאה בעיבוד התשובה. נסו שוב.",
      });
      res.end();
    }
  });

  app.post("/api/upload", upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const file = req.file as { buffer: Buffer; mimetype: string; originalname: string };

      let textContent = "";
      if (file.mimetype === "application/pdf") {
        textContent = file.buffer.toString("utf-8").replace(/[^\u0020-\u007E\u0590-\u05FF\u0600-\u06FF\s]/g, " ");
      } else {
        textContent = file.buffer.toString("utf-8");
      }

      if (!textContent.trim()) {
        return res.status(400).json({ message: "File is empty or unreadable" });
      }

      const chunks = chunkText(textContent);

      const allMemories = await storage.getRecentMemories(50);
      if (allMemories.length > 0) {
        buildVocab([...allMemories.map(m => m.text), ...chunks]);
      } else {
        buildVocab(chunks);
      }

      const storedChunks = [];
      for (const chunk of chunks) {
        const vector = textToVector(chunk);
        const mem = await storage.createMemory({
          text: chunk,
          vector,
          category: "file_upload",
        });
        storedChunks.push({ id: mem.id, textPreview: chunk.substring(0, 100) });
      }

      res.json({
        success: true,
        filename: file.originalname,
        totalChunks: storedChunks.length,
        chunks: storedChunks,
      });
    } catch (error: any) {
      console.error("File upload error:", error);
      res.status(500).json({ message: "Failed to process file" });
    }
  });

  app.get("/api/user-profile", async (_req, res) => {
    try {
      const profile = await storage.getUserProfile();
      res.json(profile || { coreProfile: {}, livingPromptSummary: "" });
    } catch (error) {
      console.error("Get user profile error:", error);
      res.status(500).json({ message: "Failed to get user profile" });
    }
  });

  app.post("/api/user-profile", async (req, res) => {
    try {
      const { coreProfile, livingPromptSummary } = req.body;
      const profile = await storage.upsertUserProfile({
        ...(coreProfile !== undefined ? { coreProfile } : {}),
        ...(livingPromptSummary !== undefined ? { livingPromptSummary } : {}),
      });
      res.json(profile);
    } catch (error) {
      console.error("Update user profile error:", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  app.post("/api/save-rule", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string" || text.trim().length < 5) {
        return res.status(400).json({ message: "Text is required (minimum 5 characters)" });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const savedGoogleKey = process.env.GOOGLE_API_KEY;
      if (savedGoogleKey) delete process.env.GOOGLE_API_KEY;
      const ai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
      });
      if (savedGoogleKey) process.env.GOOGLE_API_KEY = savedGoogleKey;

      const summaryResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `סכם את הטקסט הבא לכלל אחד תמציתי (משפט אחד בעברית) שמתאר את ההעדפה או התובנה של המשתמש. החזר JSON בפורמט: {"rule": "..."}.\n\nטקסט:\n${text.substring(0, 2000)}` }] }],
        config: { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
      });

      const rawRule = summaryResponse.text || "";
      const cleanedRule = rawRule.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let rule: string;
      try {
        const parsed = JSON.parse(cleanedRule);
        rule = parsed.rule || text.substring(0, 150);
      } catch {
        rule = text.substring(0, 150);
      }

      const profile = await storage.getUserProfile();
      const currentProfile = (profile?.coreProfile as any) || {};
      const existingRules: string[] = currentProfile.core_rules || [];
      existingRules.push(rule);

      await storage.upsertUserProfile({
        coreProfile: { ...currentProfile, core_rules: existingRules },
      });

      console.log(`[SaveRule] New rule added: "${rule}" (total: ${existingRules.length})`);

      res.json({ success: true, rule, totalRules: existingRules.length });
    } catch (error: any) {
      console.error("Save rule error:", error);
      res.status(500).json({ message: "Failed to save rule" });
    }
  });

  app.post("/api/chat/tts", async (req, res) => {
    try {
      const { text, role, conversationId } = req.body;
      if (!text || !role) {
        return res.status(400).json({ message: "Text and role are required" });
      }

      const cleanedText = text.replace(/\[(?:ONTOLOGY|RENAISSANCE|CRISIS|ARISTOTLE|COACH|FOX)_END\]/g, "").trim();
      if (!cleanedText) {
        return res.status(400).json({ message: "No speakable text after removing stop tokens" });
      }

      const allowedVoices = new Set([
        "achernar","achird","algenib","algieba","alnilam","aoede","autonoe",
        "callirrhoe","charon","despina","enceladus","erinome","fenrir","gacrux",
        "iapetus","kore","laomedeia","leda","orus","puck","pulcherrima",
        "rasalgethi","sadachbia","sadaltager","schedar","sulafat","umbriel",
        "vindemiatrix","zephyr","zubenelgenubi"
      ]);

      const fallbacks: Record<string, string> = {
        ontological: "Charon",
        renaissance: "Puck",
        crisis: "Orus",
        operational: "Fenrir",
      };

      let voiceName = "";
      if (conversationId) {
        const conv = await storage.getConversation(conversationId);
        if (conv && conv.voiceSettings) {
          const settings = conv.voiceSettings as any;
          const stored = settings[role];
          if (stored && allowedVoices.has(stored.toLowerCase())) {
            voiceName = stored;
          }
        }
      }

      if (!voiceName) {
        voiceName = fallbacks[role] || "Kore";
      }

      const rolePrompts: Record<string, string> = {
        ontological: "דבר בקול גברי מבוגר, סמכותי ורגוע, לוגי וקר, בעברית טבעית. הגיית עברית ברורה ומדויקת.",
        renaissance: "דבר בקול גברי אנרגטי, מעורר השראה וויזואלי, בעברית טבעית. הגיית עברית ברורה ומדויקת.",
        crisis: "דבר בקול גברי מבוגר, סקפטי וישיר, כמו מנהל משבר שלא מפחד לומר את האמת, בעברית טבעית. הגיית עברית ברורה ומדויקת.",
        operational: "דבר בקול גברי חד, תכליתי וצבאי, בעברית טבעית. הגיית עברית ברורה ומדויקת.",
      };

      const preparedText = cleanedText
        .replace(/([.!?])(?=\S)/g, "$1 ")
        .replace(/,(?=\S)/g, ", ")
        .replace(/–/g, " – ")
        .replace(/\s{2,}/g, " ")
        .trim();

      const rateMap: Record<string, number> = { ontological: 0.9, renaissance: 1.1, crisis: 0.85, operational: 1.15 };
      const pitchMap: Record<string, number> = { ontological: -2.0, renaissance: 1.0, crisis: -4.0, operational: -1.0 };
      const ttsRate = rateMap[role] || 0.9;
      const ttsPitch = pitchMap[role] || 0;
      const pitchStr = ttsPitch > 0 ? `+${ttsPitch}` : `${ttsPitch}`;
      const ssmlText = `<prosody rate="${ttsRate}" pitch="${pitchStr}st">${preparedText}</prosody>`;
      const prompt = (rolePrompts[role] || "אמור בעברית:") + "\n" + ssmlText;

      const { GoogleGenAI } = await import("@google/genai");

      const keyCandidates: { key: string; label: string; useProxy: boolean }[] = [];
      if (process.env.GEMINI_API_KEY) keyCandidates.push({ key: process.env.GEMINI_API_KEY, label: "GEMINI_API_KEY", useProxy: false });
      if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== process.env.GEMINI_API_KEY) keyCandidates.push({ key: process.env.GOOGLE_API_KEY, label: "GOOGLE_API_KEY", useProxy: false });
      if (process.env.GOOGLE_CLOUD_API_KEY) keyCandidates.push({ key: process.env.GOOGLE_CLOUD_API_KEY, label: "GOOGLE_CLOUD_API_KEY", useProxy: false });
      if (process.env.AI_INTEGRATIONS_GEMINI_API_KEY) keyCandidates.push({ key: process.env.AI_INTEGRATIONS_GEMINI_API_KEY, label: "AI_INTEGRATIONS", useProxy: !!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL });

      const ttsModels = ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts"];
      let audioData: string | undefined;
      let lastError: any;
      for (const model of ttsModels) {
        if (audioData) break;
        for (const candidate of keyCandidates) {
          try {
            const savedGoogleKey = process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_API_KEY;
            const ttsOptions: any = { apiKey: candidate.key };
            if (candidate.useProxy) {
              ttsOptions.httpOptions = { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL };
            }
            const ttsAi = new GoogleGenAI(ttsOptions);
            if (savedGoogleKey) process.env.GOOGLE_API_KEY = savedGoogleKey;

            const response = await ttsAi.models.generateContent({
              model,
              contents: [{ parts: [{ text: prompt }] }],
              config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName },
                  },
                },
              },
            });

            audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              console.log(`TTS success with key: ${candidate.label}, model: ${model}`);
              break;
            }
          } catch (keyErr: any) {
            const errDetail = keyErr.message || JSON.stringify(keyErr);
            console.warn(`TTS failed with ${candidate.label} model=${model}: status=${keyErr.status} detail=${errDetail.substring(0, 200)}`);
            lastError = keyErr;
          }
        }
      }

      if (audioData) {
        const pcmBuffer = Buffer.from(audioData, "base64");
        const sampleRate = 24000;
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcmBuffer.length;
        const headerSize = 44;
        const wavHeader = Buffer.alloc(headerSize);
        wavHeader.write("RIFF", 0);
        wavHeader.writeUInt32LE(dataSize + headerSize - 8, 4);
        wavHeader.write("WAVE", 8);
        wavHeader.write("fmt ", 12);
        wavHeader.writeUInt32LE(16, 16);
        wavHeader.writeUInt16LE(1, 20);
        wavHeader.writeUInt16LE(numChannels, 22);
        wavHeader.writeUInt32LE(sampleRate, 24);
        wavHeader.writeUInt32LE(byteRate, 28);
        wavHeader.writeUInt16LE(blockAlign, 32);
        wavHeader.writeUInt16LE(bitsPerSample, 34);
        wavHeader.write("data", 36);
        wavHeader.writeUInt32LE(dataSize, 40);
        const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
        res.setHeader("Content-Type", "audio/wav");
        return res.send(wavBuffer);
      }

      console.warn("All Gemini TTS keys failed, falling back to ElevenLabs...");
      try {
        const { getUncachableElevenLabsClient } = await import("./lib/elevenlabs.js");
        const elevenlabs = await getUncachableElevenLabsClient();

        const elevenVoices: Record<string, string> = {
          ontological: "VR6AewLTigWG4xSOukaG",
          renaissance: "IKne3meq5aSn9XLyUdCD",
          crisis: "JBFqnCBsd6RMkjVDRZzb",
          operational: "IKne3meq5aSn9XLyUdCD",
        };

        const selectedVoice = elevenVoices[role] || "VR6AewLTigWG4xSOukaG";

        const audioStream = await elevenlabs.textToSpeech.convert(selectedVoice, {
          text: preparedText,
          modelId: "eleven_multilingual_v2",
          voiceSettings: {
            stability: 0.5,
            similarityBoost: 0.8,
          },
        });

        const chunks: Buffer[] = [];
        const reader = audioStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(Buffer.from(value));
        }
        const audioBuffer = Buffer.concat(chunks);
        console.log(`TTS success with ElevenLabs, voice: ${selectedVoice}, size: ${audioBuffer.length}`);
        res.setHeader("Content-Type", "audio/mpeg");
        return res.send(audioBuffer);
      } catch (elevenErr: any) {
        console.error("ElevenLabs TTS also failed:", elevenErr.message || elevenErr);
        return res.status(503).json({ message: "שירות הקול אינו זמין כרגע. נסו שוב." });
      }
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });

  app.patch("/api/conversations/:id/voice-settings", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const parsed = voiceSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid settings" });
      }
      await storage.updateVoiceSettings(id, parsed.data);
      res.json({ success: true });
    } catch (error) {
      console.error("Update voice settings error:", error);
      res.status(500).json({ message: "Failed to update voice settings" });
    }
  });

  app.get("/api/voices", async (_req, res) => {
    const geminiVoices = [
      { id: "Aoede", name: "Aoede - נשי, רגוע ונעים" },
      { id: "Charon", name: "Charon - גברי, חם וסמכותי" },
      { id: "Fenrir", name: "Fenrir - גברי, עמוק" },
      { id: "Kore", name: "Kore - ניטרלי, רב-תכליתי" },
      { id: "Puck", name: "Puck - גברי, אנרגטי וחד" },
      { id: "Leda", name: "Leda - נשי, חם" },
      { id: "Orus", name: "Orus - גברי, רציני" },
      { id: "Zephyr", name: "Zephyr - נשי, קליל" },
    ];
    res.json(geminiVoices);
  });

  app.get("/api/conversations", async (_req, res) => {
    try {
      const convs = await storage.getAllConversations();
      res.json(convs.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: (c.messages as any[]).length, createdAt: c.createdAt })));
    } catch (error) {
      console.error("List conversations error:", error);
      res.status(500).json({ message: "Failed to list conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conv = await storage.getConversation(id);
      if (!conv) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      res.json(conv);
    } catch (error) {
      console.error("Get conversation error:", error);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete conversation error:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  app.get("/api/conversations/:id/export", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conv = await storage.getConversation(id);
      if (!conv) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const exportData = {
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messages: conv.messages,
        systemPrompt: BASE_SYSTEM_PROMPT,
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="The Analysis Room-${id}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Failed to export conversation" });
    }
  });

  app.get("/api/export-all", async (_req, res) => {
    try {
      const convs = await storage.getAllConversations();
      const memContexts = await storage.getRecentMemoryContexts(100);
      const userProfile = await storage.getUserProfile();

      const exportData = {
        exportDate: new Date().toISOString(),
        platform: "חדר המומחים - The Analysis Room",
        conversations: convs,
        memoryContexts: memContexts,
        userProfile,
        systemPrompt: BASE_SYSTEM_PROMPT,
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="The Analysis Room-backup-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error("Export all error:", error);
      res.status(500).json({ message: "Failed to export" });
    }
  });

  app.get("/api/tts/audio/:id", (req, res) => {
    const audioBuffer = getAudio(req.params.id);
    if (!audioBuffer) {
      return res.status(404).json({ message: "Audio not found or expired" });
    }
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    res.send(audioBuffer);
  });

  app.post("/api/video/generate", async (req, res) => {
    try {
      const { text, role, conversationId } = req.body;
      if (!text || !role || !conversationId) {
        return res.status(400).json({ message: "text, role, and conversationId are required" });
      }

      const profile = HEYGEN_CHARACTER_PROFILES[role];
      if (!profile) {
        return res.status(400).json({ message: `No HeyGen profile for role: ${role}. Available: ${Object.keys(HEYGEN_CHARACTER_PROFILES).join(", ")}` });
      }

      const sentences = splitIntoSentences(text);
      const jobs = sentences.map((sentence, idx) =>
        createVideoJob({ conversationId, role, sentenceIndex: idx, text: sentence })
      );

      res.json({
        jobs: jobs.map(j => ({ id: j.id, sentenceIndex: j.sentenceIndex, text: j.text, status: j.status })),
        totalSentences: sentences.length,
      });

      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const baseUrl = `${protocol}://${host}`;

      for (const job of jobs) {
        try {
          updateVideoJob(job.id, { status: "generating_audio" });

          const preparedText = job.text
            .replace(/\[(?:ONTOLOGY|RENAISSANCE|CRISIS|ARISTOTLE|COACH|FOX)_END\]/g, "")
            .replace(/([.!?])(?=\S)/g, "$1 ")
            .replace(/,(?=\S)/g, ", ")
            .replace(/–/g, " – ")
            .replace(/\s{2,}/g, " ")
            .trim();

          const rateValue = profile.speakingRate;
          const ssmlText = `<prosody rate="${rateValue}" pitch="${profile.pitch > 0 ? "+" : ""}${profile.pitch}st">${preparedText}</prosody>`;
          const prompt = "אמור בעברית:\n" + ssmlText;

          const { GoogleGenAI } = await import("@google/genai");
          const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
          if (!geminiKey) {
            updateVideoJob(job.id, { status: "failed", error: "Gemini API key not configured" });
            continue;
          }

          const savedGoogleKey = process.env.GOOGLE_API_KEY;
          delete process.env.GOOGLE_API_KEY;
          const ttsVidOpts: any = { apiKey: geminiKey };
          if (geminiKey === process.env.AI_INTEGRATIONS_GEMINI_API_KEY && process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
            ttsVidOpts.httpOptions = { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL };
          }
          const ttsAi = new GoogleGenAI(ttsVidOpts);
          if (savedGoogleKey) process.env.GOOGLE_API_KEY = savedGoogleKey;

          const ttsResponse = await ttsAi.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: prompt }] }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: profile.voiceName },
                },
              },
            },
          });

          const audioDataVid = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!audioDataVid) {
            updateVideoJob(job.id, { status: "failed", error: "No audio data from Gemini TTS" });
            continue;
          }

          const pcmBuffer = Buffer.from(audioDataVid, "base64");
          const sampleRate = 24000;
          const numChannels = 1;
          const bitsPerSample = 16;
          const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
          const blockAlign = numChannels * (bitsPerSample / 8);
          const dataSize = pcmBuffer.length;
          const headerSize = 44;
          const wavHeader = Buffer.alloc(headerSize);
          wavHeader.write("RIFF", 0);
          wavHeader.writeUInt32LE(dataSize + headerSize - 8, 4);
          wavHeader.write("WAVE", 8);
          wavHeader.write("fmt ", 12);
          wavHeader.writeUInt32LE(16, 16);
          wavHeader.writeUInt16LE(1, 20);
          wavHeader.writeUInt16LE(numChannels, 22);
          wavHeader.writeUInt32LE(sampleRate, 24);
          wavHeader.writeUInt32LE(byteRate, 28);
          wavHeader.writeUInt16LE(blockAlign, 32);
          wavHeader.writeUInt16LE(bitsPerSample, 34);
          wavHeader.write("data", 36);
          wavHeader.writeUInt32LE(dataSize, 40);
          const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

          const audioId = storeAudio(wavBuffer);
          updateVideoJob(job.id, { status: "uploading", audioId });

          const audioUrl = `${baseUrl}/api/tts/audio/${audioId}`;

          updateVideoJob(job.id, { status: "rendering" });
          const { videoId } = await generateHeyGenVideo({
            audioUrl,
            profile,
            dimension: { width: 512, height: 512 },
          });

          updateVideoJob(job.id, { heygenVideoId: videoId });
          console.log(`HeyGen video job ${job.id} submitted, videoId: ${videoId}`);

        } catch (err: any) {
          console.error(`Video job ${job.id} error:`, err);
          updateVideoJob(job.id, { status: "failed", error: err.message || "Unknown error" });
        }
      }
    } catch (error: any) {
      console.error("Video generate error:", error);
      res.status(500).json({ message: "Failed to start video generation" });
    }
  });

  app.post("/api/video/generate-batch", async (req, res) => {
    try {
      const { turns, conversationId } = req.body;
      if (!Array.isArray(turns) || !conversationId) {
        return res.status(400).json({ message: "turns (array) and conversationId are required" });
      }

      const validTurns = turns.filter((t: any) => {
        const profile = HEYGEN_CHARACTER_PROFILES[t.character];
        return profile && t.text;
      });

      if (validTurns.length === 0) {
        return res.status(400).json({ message: "No valid turns with HeyGen profiles found" });
      }

      const allJobs: any[] = [];
      let globalSentenceIdx = 0;
      for (const turn of validTurns) {
        const sentences = splitIntoSentences(turn.text);
        for (const sentence of sentences) {
          const job = createVideoJob({
            conversationId,
            role: turn.character,
            sentenceIndex: globalSentenceIdx++,
            text: sentence,
          });
          allJobs.push(job);
        }
      }

      res.json({
        jobs: allJobs.map(j => ({
          id: j.id,
          role: j.role,
          sentenceIndex: j.sentenceIndex,
          text: j.text,
          status: j.status,
        })),
        totalJobs: allJobs.length,
      });
    } catch (error: any) {
      console.error("Video batch generate error:", error);
      res.status(500).json({ message: "Failed to start batch video generation" });
    }
  });

  app.get("/api/video/status/:jobId", async (req, res) => {
    try {
      const job = getVideoJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ message: "Video job not found" });
      }

      if (job.status === "rendering" && job.heygenVideoId) {
        try {
          const heygenStatus = await checkHeyGenVideoStatus(job.heygenVideoId);
          if (heygenStatus.status === "completed" && heygenStatus.videoUrl) {
            updateVideoJob(job.id, { status: "completed", videoUrl: heygenStatus.videoUrl });
          } else if (heygenStatus.status === "failed") {
            updateVideoJob(job.id, { status: "failed", error: heygenStatus.error || "HeyGen rendering failed" });
          }
        } catch (pollErr: any) {
          console.error(`Status poll error for ${job.id}:`, pollErr.message);
        }
      }

      const updatedJob = getVideoJob(req.params.jobId);
      res.json({
        id: updatedJob!.id,
        role: updatedJob!.role,
        sentenceIndex: updatedJob!.sentenceIndex,
        text: updatedJob!.text,
        status: updatedJob!.status,
        videoUrl: updatedJob!.videoUrl,
        error: updatedJob!.error,
      });
    } catch (error: any) {
      console.error("Video status error:", error);
      res.status(500).json({ message: "Failed to check video status" });
    }
  });

  app.get("/api/video/jobs/:conversationId", async (req, res) => {
    try {
      const convId = parseInt(req.params.conversationId);
      const jobs = getVideoJobsByConversation(convId);

      for (const job of jobs) {
        if (job.status === "rendering" && job.heygenVideoId) {
          try {
            const heygenStatus = await checkHeyGenVideoStatus(job.heygenVideoId);
            if (heygenStatus.status === "completed" && heygenStatus.videoUrl) {
              updateVideoJob(job.id, { status: "completed", videoUrl: heygenStatus.videoUrl });
            } else if (heygenStatus.status === "failed") {
              updateVideoJob(job.id, { status: "failed", error: heygenStatus.error || "HeyGen rendering failed" });
            }
          } catch {}
        }
      }

      const updatedJobs = getVideoJobsByConversation(convId);
      res.json(updatedJobs.map(j => ({
        id: j.id,
        role: j.role,
        sentenceIndex: j.sentenceIndex,
        text: j.text,
        status: j.status,
        videoUrl: j.videoUrl,
        error: j.error,
      })));
    } catch (error: any) {
      console.error("Video jobs list error:", error);
      res.status(500).json({ message: "Failed to list video jobs" });
    }
  });

  app.post("/api/video/approve/:jobId", async (req, res) => {
    try {
      const job = approveVideoJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ message: "Video job not found" });
      }
      res.json({ id: job.id, status: job.status, videoUrl: job.videoUrl });
    } catch (error: any) {
      console.error("Approve video error:", error);
      res.status(500).json({ message: "Failed to approve video" });
    }
  });

  app.get("/api/video/profiles", (_req, res) => {
    res.json(HEYGEN_CHARACTER_PROFILES);
  });

  app.get("/api/video/avatars", async (_req, res) => {
    try {
      const avatars = await listHeyGenAvatars();
      res.json(avatars);
    } catch (error: any) {
      console.error("List avatars error:", error);
      res.status(500).json({ message: "Failed to list avatars" });
    }
  });

  app.get("/api/memories", async (_req, res) => {
    try {
      const mems = await storage.getRecentMemories(50);
      res.json(mems);
    } catch (error) {
      console.error("Get memories error:", error);
      res.status(500).json({ message: "Failed to get memories" });
    }
  });

  app.post("/api/memories", async (req, res) => {
    try {
      const { text, category } = req.body;
      if (!text) return res.status(400).json({ message: "text is required" });
      const vector = textToVector(text);
      const mem = await storage.createMemory({ text, vector, category: category || "general" });
      res.json(mem);
    } catch (error) {
      console.error("Create memory error:", error);
      res.status(500).json({ message: "Failed to create memory" });
    }
  });

  app.get("/api/agent/profile", async (_req, res) => {
    try {
      const mems = await storage.getRecentMemories(100);
      const profile = buildUserProfile(mems);
      res.json(profile);
    } catch (error) {
      console.error("Agent profile error:", error);
      res.status(500).json({ message: "Failed to get agent profile" });
    }
  });

  app.get("/api/agent/personas", (_req, res) => {
    res.json(META_AGENTS);
  });

  app.get("/api/scout-logs", (_req, res) => {
    const logs = getScoutLogs();
    res.json(logs.map(entry => ({
      timestamp: entry.timestamp,
      topic: entry.topic,
      summary: entry.summary,
      source: entry.source,
      trends: entry.report.market_trends,
    })));
  });

  app.get("/api/acquired-items", async (_req, res) => {
    try {
      const items = await storage.getAcquiredItems();
      res.json(items);
    } catch (error) {
      console.error("Get acquired items error:", error);
      res.status(500).json({ message: "Failed to get acquired items" });
    }
  });

  app.delete("/api/acquired-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAcquiredItem(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete acquired item error:", error);
      res.status(500).json({ message: "Failed to delete acquired item" });
    }
  });
}
