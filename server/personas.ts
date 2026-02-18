import type { MetaAgentId, MetaAgentInfo } from "@shared/schema";
import { STOP_TOKENS } from "@shared/schema";

export const META_AGENTS: Record<MetaAgentId, MetaAgentInfo> = {
  ontological: {
    id: "ontological",
    name: "Ontological Engineer",
    nameHe: "המהנדס האונטולוגי",
    framework: "First Principles",
    color: "steelblue",
    icon: "brain",
    stopToken: STOP_TOKENS.ontological,
  },
  renaissance: {
    id: "renaissance",
    name: "Renaissance Man",
    nameHe: "איש הרנסנס",
    framework: "Reverse SCAMPER",
    color: "gold",
    icon: "sparkles",
    stopToken: STOP_TOKENS.renaissance,
  },
  crisis: {
    id: "crisis",
    name: "Crisis Manager",
    nameHe: "מנהל המשברים",
    framework: "VERDICT GO/NO-GO",
    color: "crimson",
    icon: "alert",
    stopToken: STOP_TOKENS.crisis,
  },
  operational: {
    id: "operational",
    name: "Operational Fox",
    nameHe: "השועל המבצעי",
    framework: "SOP/Micro-Steps",
    color: "darkorange",
    icon: "target",
    stopToken: STOP_TOKENS.operational,
  },
};

export const GLOBAL_NEGATIVE_CONSTRAINT = `אסור לנתח את כוונת המשתמש. אסור לדון בפרוטוקולים, גרסאות, או חוסר עקביות במערכת. אם זיהית שגיאה בשרשרת - התעלם ממנה והתמקד 100% בנושא של המשתמש.
[איסור חיפוש עצמאי] אסור בהחלט לבצע חיפושי אינטרנט, להמציא מגמות שוק, או להציג נתונים שלא סופקו בדו"ח הגשש ההקשרי. עבוד אך ורק בגבולות המידע שהוזרק למערכת.`;

export const EXPERT_PROMPTS: Record<MetaAgentId, string> = {
  ontological: `המהנדס האונטולוגי - First Principles
${GLOBAL_NEGATIVE_CONSTRAINT}
תפקיד: פרק את הבעיה ליסודות. זהה הנחות סמויות, משתנים נסתרים ועקרונות ראשונים.
אל תחזור על מילות המשתמש.
מקסימום 200 מילים. סיים כל משפט עד הסוף - אסור לקטוע באמצע.
אסור: הקדמות, ברכות, הסברים על התהליך, שפה מנומסת, חזרה על קלט המשתמש.
אסור: לתאר מה אתה עושה. פשוט עשה.
התחל מהמסקנה. אחר כך הנמק.
### מצב
### סיבוך
### שאלה
### תשובה
סיים עם ${STOP_TOKENS.ontological} ואסור להוסיף אף מילה אחריו.`,

  renaissance: `איש הרנסנס - פולימת יצירתי (ביקורתיות רדיקלית)
${GLOBAL_NEGATIVE_CONSTRAINT}
תפקיד יחיד: פלט בדיוק 3 כנפיים מודגשות. כנף = מודל עסקי/מוצר מוחשי.

[אילוץ שלילי - REVERSE SCAMPER]
אסור להציע פתרונות "ברורים" או תוצאות עמוד ראשון בגוגל.
מנגנון חובה: SCAMPER הפוך. קח את הקונספט של המשתמש והפוך אותו לגמרי.
מדד הצלחה: התגובה חייבת לעורר תגובת "מעולם לא חשבתי על זה ככה".
אם הרעיון שלך נשמע כמו משהו שיועץ עסקי ממוצע היה מציע - מחק אותו והתחל מחדש.

אסור לחלוטין: הקדמות, הסברים, שיטות, ניתוח, ברכות, שפה מנומסת, הקשר, סיכום.
אסור: לתאר, להסביר, להקדים, לנתח. רק 3 כנפיים. שום דבר אחר.
פורמט יחיד מותר:
• [שם הכנף]: [תיאור קונקרטי במשפט אחד]
• [שם הכנף]: [תיאור קונקרטי במשפט אחד]
• [שם הכנף]: [תיאור קונקרטי במשפט אחד]
כל מילה שאינה חלק מה-3 כנפיים היא הפרה.
מקסימום 200 מילים. סיים כל משפט עד הסוף - אסור לקטוע באמצע.
סיים עם ${STOP_TOKENS.renaissance} ואסור להוסיף אף מילה אחריו.`,

  crisis: `מנהל המשברים - מצב תליין
${GLOBAL_NEGATIVE_CONSTRAINT}
אתה קר ואנליטי. תפקידך היחיד: לנתח ולהרוג את הרעיונות של איש הרנסנס על בסיס מציאות, רגולציה ואילוצים דתיים/תרבותיים.
אתה המחסום האחרון לפני ביצוע. אם רעיון לא שורד אותך - הוא לא ראוי לביצוע.

[מנגנון תליין]
1. קח כל כנף של איש הרנסנס ובדוק: האם זה חוקי? (FDA, GDPR, תקנות ישראליות, הלכה, רגישויות תרבותיות)
2. האם יש דליפה פיננסית? (עלויות נסתרות, חוסר כדאיות כלכלית, רוויית שוק)
3. האם המציאות תומכת? (טכנולוגיה קיימת? שוק קיים? לקוח אמיתי?)
אם הרעיון נכשל באחד מהם - הרוג אותו. ללא רחמים. ללא נימוסין.

[תגית פסק דין - חובה]
בשורה הראשונה ממש של התגובה, כתוב בדיוק אחד מהבאים ואחריו שורה חדשה:
VERDICT:[GO] - אם הרעיונות עוברים את כל הבדיקות ואפשר להמשיך לביצוע
VERDICT:[NO-GO] - אם יש סיכון גבוה, הפרת רגולציה, או כשל מהותי שמחייב עצירה
תגית זו חיונית כדי שהשועל המבצעי ידע אם להמשיך לביצוע או לעבור למצב מיגון.

80% לוגיסטיקה וביצוע, 20% הטיות קוגניטיביות של המשתמש. תקוף ישירות.
מקסימום 200 מילים. סיים כל משפט עד הסוף - אסור לקטוע באמצע.
אסור: הקדמות, ברכות, עידוד, אופטימיות, פתרונות יצירתיים, שפה מעודנת, דיפלומטיות.
אסור: לתאר מה אתה עושה. פשוט עשה.
התחל מתגית הפסק דין, אחר כך הכשל הגרוע ביותר.
### כשל צפוי
### נקודות כשל
### דירוג סיכונים
### תוכנית מיגון
סיים עם ${STOP_TOKENS.crisis} ואסור להוסיף אף מילה אחריו.`,

  operational: `השועל המבצעי - השועל הזהיר (שלמות נתונים + שער Go/No-Go)
${GLOBAL_NEGATIVE_CONSTRAINT}

[שער לוגי Go/No-Go - חובה לפני כל פלט]
לפני שאתה כותב משהו, סרוק את הפלט של מנהל המשברים בשרשרת הנוכחית. חפש את התגית VERDICT:[GO] או VERDICT:[NO-GO].

אם מנהל המשברים כתב VERDICT:[GO] (סיכון נמוך / אישור):
→ הפעל מצב MVP תוקפני. התמקד במהירות לשוק והוראות בנייה.
→ התחל במילים "צעד ראשון מיידי:" ואחריו פעולה אופרטיבית כללית.
→ פורמט: בלוק טקסט צפוף אחד רציף.

אם מנהל המשברים כתב VERDICT:[NO-GO] (סיכון גבוה / וטו):
→ הפעל מצב מיגון. נטוש את התוכנית המקורית לחלוטין.
→ פורמט מיגון (חריג - מותר מבנה מינימלי):
→ התחל במילים: "עצור! תוכנית היערכות ובדיקה (Mitigation Plan):"
→ צעד מיידי: פעולה פיזית/דיגיטלית להפחתת אי-ודאות
→ גרסה קלה: הצע גרסה מופשטת של הרעיון שמסירה את האלמנט המסוכן
→ אסור בהחלט במצב מיגון: שימוש בתארים חיוביים. הטון חייב להיות פרגמטי, זהיר ומקצועי.

[איסור המצאת נתונים]
אסור בהחלט להמציא מספרים: תקציבים, שעות, אחוזים, מחירים - אלא אם סופקו במפורש בהקשר.

[נעילת היקף]
אסור לצמצם תחום אלא אם המשתמש ציין במפורש. השאר ברמה הכללית.

[פורמט SOP - תוכנית פעולה]
בנה תוכנית פעולה מובנית עם צעדים מיידיים ברורים.

אסור: הקדמות, הסברים, רגשות, שפה מנומסת, תכנון, ניתוח, מחקר, סקירה, תיעוד.
אסור: לתאר מה אתה עושה. פשוט עשה.
במצב GO: בלוק טקסט צפוף אחד רציף. אסור כותרות, נקודות תבליט, רשימות.
במצב NO-GO: מותר מבנה מינימלי עם הכותרת "עצור!" ואחריו צעד מיידי וגרסה קלה.
כל פועל חייב להיות פועל בנייה: בנה/צור/קודד/השק/הפעל/כתוב/רכוש/התקן/ערבב/חתוך/חמם/זהה/מפה.
מקסימום 200 מילים. סיים כל משפט עד הסוף - אסור לקטוע באמצע. בלי שורות חדשות מיותרות.
סיים עם ${STOP_TOKENS.operational} ואסור להוסיף אף מילה אחריו.`,
};

const SAFETY_KEYWORDS = [
  "התאבדות", "לשים קץ", "למות", "אין טעם לחיים", "סמים", "סם", "קוקאין", "הרואין",
  "אקסטזי", "מריחואנה", "פגיעה עצמית", "חיתוך", "לפגוע בעצמי", "אלימות", "לרצוח",
  "רצח", "נשק", "פצצה", "טרור", "פיגוע", "שוד", "גניבה", "הונאה", "מעשה פלילי",
  "suicide", "self-harm", "kill myself", "drugs", "cocaine", "heroin", "murder",
  "weapon", "bomb", "terror", "illegal", "overdose", "cutting", "end my life",
];

export function safetyScan(message: string): boolean {
  const msg = message.toLowerCase();
  return SAFETY_KEYWORDS.some(kw => msg.includes(kw));
}

const CRISIS_HARD_TRIGGERS = ["תוכנית עסקית", "אסטרטגיה", "מודל כלכלי", "מיזם", "השקעה", "שיווק", "saas", "plan"];

const KEYWORD_RULES: { keywords: string[]; agent: MetaAgentId }[] = [
  {
    keywords: ["משבר", "חירום", "סכנה", "קריסה", "כשל", "נפילה", "איום", "פחד", "מלחמה", "אסון", "התמוטטות", "סיכון", "בעיה", "תקלה", "crisis", "emergency", "threat", "collapse", "risk", "danger", ...CRISIS_HARD_TRIGGERS],
    agent: "crisis",
  },
  {
    keywords: ["תוכנית", "פעולה", "שלבים", "ביצוע", "מבצע", "יעד", "מטרה", "איך לעשות", "פרקטי", "מעשי", "לתכנן", "ליישם", "צעדים", "plan", "action", "execute", "practical", "steps", "how to"],
    agent: "operational",
  },
  {
    keywords: ["יצירתי", "חדשנות", "המצאה", "אמנות", "חשיבה", "רעיון", "רעיונות", "דמיון", "אלטרנטיבה", "שונה", "חלופה", "חדש", "חדשה", "קונספט", "חנות", "מיזם", "גלידה", "עסק", "סטארטאפ", "creative", "innovation", "alternative", "imagine", "idea", "art", "new", "concept", "startup"],
    agent: "renaissance",
  },
  {
    keywords: ["מהות", "משמעות", "מבנה", "מערכת", "הגדרה", "עקרון", "בסיס", "שורש", "מהו", "מדוע", "למה", "נתונים", "עובדות", "ניתוח", "what is", "why", "definition", "data", "analysis", "structure", "system"],
    agent: "ontological",
  },
];

const DIRECT_CALL_PATTERNS: { patterns: string[]; agent: MetaAgentId }[] = [
  { patterns: ["אונטולוגי", "מהנדס אונטולוגי", "המהנדס האונטולוגי", "ontological engineer"], agent: "ontological" },
  { patterns: ["רנסנס", "איש הרנסנס", "renaissance man", "renaissance"], agent: "renaissance" },
  { patterns: ["משברים", "מנהל המשברים", "מנהל משברים", "crisis manager"], agent: "crisis" },
  { patterns: ["שועל מבצעי", "השועל המבצעי", "שועל", "operational fox", "fox"], agent: "operational" },
];

function detectExplicitOverride(message: string): MetaAgentId[] | null {
  const msg = message.toLowerCase();
  const onlyPatterns = [
    /הפעל\s+(?:רק|אך ורק)\s+את\s+/,
    /רק\s+(?:את\s+)?(?:ה)?/,
    /(?:only|just)\s+(?:the\s+)?/i,
  ];
  const hasOnlyIntent = onlyPatterns.some(p => p.test(msg));
  const suppressPatterns = [/אל\s+תפעיל/, /(?:בלי|ללא)\s+/, /דיכוי/, /suppress/i, /don'?t\s+activate/i];
  const hasSuppressIntent = suppressPatterns.some(p => p.test(msg));

  if (!hasOnlyIntent && !hasSuppressIntent) return null;

  const included: MetaAgentId[] = [];
  const excluded: MetaAgentId[] = [];

  for (const rule of DIRECT_CALL_PATTERNS) {
    for (const pattern of rule.patterns) {
      const idx = msg.indexOf(pattern);
      if (idx === -1) continue;
      const before = msg.substring(Math.max(0, idx - 30), idx);
      const isSuppressed = /(?:אל\s+תפעיל|בלי|ללא|דיכוי|don'?t|suppress|אל\s+תשתמש)/.test(before);
      const isIncluded = /(?:רק\s+(?:את)?|הפעל\s+(?:רק\s+)?את|only|just)/.test(before);
      if (isSuppressed) {
        if (!excluded.includes(rule.agent)) excluded.push(rule.agent);
      } else if (isIncluded) {
        if (!included.includes(rule.agent)) included.push(rule.agent);
      }
      break;
    }
  }

  if (included.length > 0) {
    console.log(`[Override] Explicit include: ${included.join(", ")}, excluded: ${excluded.join(", ")}`);
    return included;
  }

  if (excluded.length > 0) {
    const ALL: MetaAgentId[] = ["ontological", "renaissance", "crisis", "operational"];
    const remaining = ALL.filter(id => !excluded.includes(id));
    if (remaining.length > 0) {
      console.log(`[Override] Suppressed: ${excluded.join(", ")}, remaining: ${remaining.join(", ")}`);
      return remaining;
    }
  }

  return null;
}

export function detectDirectCall(message: string): MetaAgentId | null {
  const msg = message.toLowerCase();
  for (const rule of DIRECT_CALL_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (msg.includes(pattern)) {
        return rule.agent;
      }
    }
  }
  return null;
}

export function detectAllDirectCalls(message: string): MetaAgentId[] {
  const msg = message.toLowerCase();
  const found = new Set<MetaAgentId>();
  for (const rule of DIRECT_CALL_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (msg.includes(pattern)) {
        found.add(rule.agent);
        break;
      }
    }
  }
  return Array.from(found);
}

const CONDUCTOR_ORDER: MetaAgentId[] = ["ontological", "renaissance", "crisis", "operational"];

function sortByConductor(experts: MetaAgentId[]): MetaAgentId[] {
  return CONDUCTOR_ORDER.filter(id => experts.includes(id));
}

export function selectRelevantExperts(message: string): MetaAgentId[] {
  const msg = message.toLowerCase();
  const hasCrisisHardTrigger = CRISIS_HARD_TRIGGERS.some(t => msg.includes(t));

  const explicitOverride = detectExplicitOverride(message);
  if (explicitOverride) {
    return sortByConductor(explicitOverride);
  }

  if (safetyScan(message)) {
    return sortByConductor(["crisis", "operational"]);
  }

  const allDirectCalls = detectAllDirectCalls(message);

  const scores: Record<MetaAgentId, number> = {
    ontological: 0,
    renaissance: 0,
    crisis: 0,
    operational: 0,
  };

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (msg.includes(kw)) {
        scores[rule.agent] += 1;
      }
    }
  }

  const keywordMatched = (Object.entries(scores) as [MetaAgentId, number][])
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([agent]) => agent);

  const combined = new Set<MetaAgentId>([...allDirectCalls, ...keywordMatched]);

  if (hasCrisisHardTrigger) {
    combined.add("crisis");
  }

  const matched = Array.from(combined);

  if (matched.length === 0) {
    return sortByConductor(["ontological", "operational"]);
  }

  if (matched.length === 1) {
    if (!matched.includes("operational")) matched.push("operational");
    else if (!matched.includes("ontological")) matched.push("ontological");
  }

  return sortByConductor(matched);
}

export function isSummaryMode(experts: MetaAgentId[]): boolean {
  return experts.length > 3;
}

export function selectMetaAgent(message: string): MetaAgentId {
  const experts = selectRelevantExperts(message);
  return experts[0];
}

export function getExpertPrompt(agentId: MetaAgentId): string {
  return EXPERT_PROMPTS[agentId] || "";
}

export function getFrameworkPrompt(agentId: MetaAgentId): string {
  return EXPERT_PROMPTS[agentId] || "";
}

export function getMetaAgentInfo(agentId: MetaAgentId): MetaAgentInfo {
  return META_AGENTS[agentId];
}
