import { useMemo, useState } from "react";
import { Eye, Newspaper, Shield, Sparkles, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import logoImage from "@assets/nexstep_logo.png";
import adlerImage from "@assets/unnamed_(2)_1770132119550.jpg";
import foxImage from "@assets/u5297525132_A_dynamic_high-energy_CGI_portrait_of_Fox_a_sharp__1770132119541.png";
import noaImage from "@assets/u5297525132_A_hyper-realistic_portrait_of_Noa_a_woman_in_her___1770132119618.png";

type Agent = {
  id: string;
  name: string;
  role: string;
  vibe: string;
  description: string;
  bullets: string[];
  icon: "shield" | "zap" | "sparkles";
  accent: "blue" | "slate" | "emerald";
  image: string;
};

function AgentIcon({ icon }: { icon: Agent["icon"] }) {
  const cls = "h-6 w-6";
  if (icon === "shield") return <Shield className={cls} strokeWidth={2.2} />;
  if (icon === "zap") return <Zap className={cls} strokeWidth={2.2} />;
  return <Sparkles className={cls} strokeWidth={2.2} />;
}

function accentVars(accent: Agent["accent"]) {
  // Adler - Deep Blue
  if (accent === "blue") {
    return {
      ring: "ring-[#1e3a5f]/30",
      border: "border-[#1e3a5f]/30",
      tint: "from-[#1e3a5f]/15 via-[#2c4a6e]/8 to-transparent",
      iconBg: "bg-[#1e3a5f]/15",
      iconFg: "text-[#1e3a5f]",
      badge: "bg-[#1e3a5f]/15 text-[#0f2440]",
      soft: "bg-[#1e3a5f]/8",
      button: "bg-[#1e3a5f] hover:bg-[#0f2440]",
      glow: "shadow-[0_20px_70px_-38px_rgba(30,58,95,0.6)]",
      cardBg: "bg-[#e8eef5]/90",
      pageBg: "bg-gradient-to-b from-[#e8eef5] to-[#f0f4f8]",
    };
  }

  // Fox - Warm Grey
  if (accent === "slate") {
    return {
      ring: "ring-[#6b5b4f]/25",
      border: "border-[#8b7b6b]/30",
      tint: "from-[#8b7b6b]/15 via-[#a89888]/8 to-transparent",
      iconBg: "bg-[#6b5b4f]/15",
      iconFg: "text-[#5a4a3e]",
      badge: "bg-[#6b5b4f]/15 text-[#4a3a2e]",
      soft: "bg-[#8b7b6b]/8",
      button: "bg-[#6b5b4f] hover:bg-[#5a4a3e]",
      glow: "shadow-[0_20px_70px_-38px_rgba(107,91,79,0.5)]",
      cardBg: "bg-[#f5f0eb]/90",
      pageBg: "bg-gradient-to-b from-[#f5f0eb] to-[#faf7f4]",
    };
  }

  // Noa - Olive Green
  return {
    ring: "ring-[#5c6b4a]/25",
    border: "border-[#6b7a5a]/30",
    tint: "from-[#6b7a5a]/15 via-[#7a8969]/8 to-transparent",
    iconBg: "bg-[#5c6b4a]/15",
    iconFg: "text-[#4a5a38]",
    badge: "bg-[#5c6b4a]/15 text-[#3a4a28]",
    soft: "bg-[#6b7a5a]/8",
    button: "bg-[#5c6b4a] hover:bg-[#4a5a38]",
    glow: "shadow-[0_20px_70px_-38px_rgba(92,107,74,0.5)]",
    cardBg: "bg-[#f0f3eb]/90",
    pageBg: "bg-gradient-to-b from-[#f0f3eb] to-[#f7f9f4]",
  };
}

const AGENTS: Agent[] = [
  {
    id: "adler",
    name: "פרופ' אדלר",
    role: "משילות השכל. הסמכות העליונה.",
    vibe: "עמוק • מכוון • סמכותי",
    description:
      "מנהל כל דיון דרך 'משילות השכל' של הרמב\"ם. האם האנושות שומרת על עוגן הידע, או שהדמיון הטכנולוגי משולח רסן?",
    bullets: ["משילות השכל", "כוחות יסודיים", "פסק דין"],
    icon: "shield",
    accent: "blue",
    image: adlerImage,
  },
  {
    id: "focus",
    name: "Focus",
    role: "חשיפת טעות התכנון. חריף ונוקב.",
    vibe: "מהיר • חד • בלי רחמים",
    description:
      "חושף את Planning Fallacy - הבטחות לא ריאליסטיות שמוסתרות תחת יהירות ויוקרה. חותך דרך תיאטרון ההצלחה.",
    bullets: ["טעות התכנון", "תיאטרון הצלחה", "ריקבון מבני"],
    icon: "zap",
    accent: "slate",
    image: foxImage,
  },
  {
    id: "noa",
    name: "נועה",
    role: "חדשנות משבשת כחוק טבע.",
    vibe: "חכם • פשוט • היסטורי",
    description:
      "חוקרת Disruptive Innovation כחוק טבע היסטורי. איך טכנולוגיות פשוטות עוקפות מסות כבדות לאורך דורות.",
    bullets: ["שיבוש היסטורי", "מלכודת המסה", "כוחות יסודיים"],
    icon: "sparkles",
    accent: "emerald",
    image: noaImage,
  },
];

function CamouflageMode({ onExit }: { onExit: () => void }) {
  return (
    <div
      className="min-h-[100dvh] bg-white text-right"
      dir="rtl"
      data-testid="page-camouflage"
    >
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-xl bg-slate-100"
              aria-hidden="true"
            />
            <div>
              <div
                className="text-sm font-semibold text-slate-900"
                data-testid="text-news-title"
              >
                חדשות היום
              </div>
              <div className="text-xs text-slate-500" data-testid="text-news-sub">
                עדכונים שוטפים • עכשיו
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            data-testid="button-exit-camouflage"
            aria-label="חזרה לאפליקציה"
          >
            <Newspaper className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-4"
              data-testid={`card-news-${i}`}
            >
              <div className="h-3 w-2/3 rounded bg-slate-200/80" />
              <div className="mt-3 h-3 w-5/6 rounded bg-slate-200/60" />
              <div className="mt-3 h-3 w-1/2 rounded bg-slate-200/60" />
              <div className="mt-5 h-20 w-full rounded-xl bg-slate-100" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function AgentCard({
  agent,
  selected,
  onSelect,
  onStart,
}: {
  agent: Agent;
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
}) {
  const a = accentVars(agent.accent);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      className={
        "nexstep-card nexstep-grain group relative overflow-hidden rounded-[28px] border p-6 shadow-sm transition-all md:p-7 " +
        a.cardBg +
        " " +
        a.border +
        " " +
        a.glow +
        " " +
        (selected ? " ring-2 " + a.ring : " hover:shadow-md")
      }
      dir="rtl"
      data-testid={`card-agent-${agent.id}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      <div
        className={
          "pointer-events-none absolute inset-0 bg-gradient-to-b " + a.tint
        }
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-3">
            <div
              className={
                "grid h-8 w-8 place-items-center rounded-xl " + a.iconBg + " " + a.iconFg
              }
              data-testid={`icon-agent-${agent.id}`}
              aria-hidden="true"
            >
              <AgentIcon icon={agent.icon} />
            </div>
            <div
              className={
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold " +
                a.badge
              }
              data-testid={`badge-agent-${agent.id}`}
            >
              {agent.vibe}
            </div>
          </div>
          <h2
            className="text-2xl font-extrabold tracking-tight text-slate-950"
            data-testid={`text-agent-name-${agent.id}`}
          >
            {agent.name}
          </h2>
          <p
            className="mt-1 text-sm font-semibold text-slate-600"
            data-testid={`text-agent-role-${agent.id}`}
          >
            {agent.role}
          </p>
        </div>

        <div className="relative h-20 w-20 md:h-24 md:w-24 flex-shrink-0 overflow-hidden rounded-2xl">
          <img 
            src={agent.image} 
            alt={agent.name}
            className="h-full w-full object-cover"
            data-testid={`img-agent-${agent.id}`}
          />
        </div>
      </div>

      <div className="relative mt-5">
        <p
          className="text-sm leading-relaxed text-slate-600"
          data-testid={`text-agent-desc-${agent.id}`}
        >
          {agent.description}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {agent.bullets.map((b) => (
            <div
              key={b}
              className={
                "rounded-full border px-3 py-1 text-xs font-semibold text-slate-700 " +
                a.soft +
                " border-slate-200/60"
              }
              data-testid={`pill-agent-${agent.id}-${b}`}
            >
              {b}
            </div>
          ))}
        </div>

        <div className="mt-7">
          <button
            type="button"
            className={
              "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold text-white shadow-sm transition-all active:translate-y-[1px] " +
              a.button
            }
            data-testid={`button-start-${agent.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              onStart();
            }}
          >
            התחל שיחה
            <span className="opacity-80" aria-hidden="true">
              ←
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function AgentSelection() {
  const [camouflage, setCamouflage] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(AGENTS[0]?.id ?? "adler");
  const [, setLocation] = useLocation();

  const selected = useMemo(
    () => AGENTS.find((a) => a.id === selectedId) ?? AGENTS[0],
    [selectedId],
  );

  const handleStart = (id: string) => {
    setLocation(`/chat/${id}`);
  };

  return (
    <div
      className="min-h-[100dvh] nexstep-gradient"
      dir="rtl"
      data-testid="page-agent-selection"
    >
      <AnimatePresence mode="wait">
        {camouflage ? (
          <motion.div
            key="camouflage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <CamouflageMode onExit={() => setCamouflage(false)} />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setCamouflage(true)}
                  className="fixed bottom-6 left-6 z-40 grid h-12 w-12 place-items-center rounded-full border border-slate-200/70 bg-white/70 shadow-md backdrop-blur transition-all hover:bg-white"
                  data-testid="button-camouflage"
                  aria-label="מצב הסוואה"
                >
                  <Eye className="h-5 w-5 text-slate-600" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>מצב הסוואה - הסתר את האפליקציה</p>
              </TooltipContent>
            </Tooltip>

            <header className="px-4 pt-10 md:px-8 md:pt-14">
              <div className="mx-auto max-w-5xl text-center">
                <div className="flex justify-center mb-6">
                  <img src={logoImage} alt="NexStep" className="h-24 md:h-44 object-contain" data-testid="img-logo" />
                </div>

                <div
                  className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/60 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur"
                  data-testid="badge-privacy"
                >
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  פרטיות גבוהה • מצב הסוואה בלחיצה אחת
                </div>

                <h1
                  className="mt-6 text-balance font-extrabold tracking-tight text-slate-950"
                  style={{ fontFamily: "var(--font-serif)" }}
                  data-testid="text-title"
                >
                  המצפן האסטרטגי
                </h1>
                <p
                  className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-slate-600 md:text-lg"
                  data-testid="text-subtitle"
                >
                  שלושה סוכני עתידנות אסטרטגית. כל אחד חושף כוחות יסודיים שמעצבים את העתיד.
                  בחר/י את המנתח — וקבל/י אקלים אסטרטגי עם הפיל האפור ואוטונומיה מחשבתית.
                </p>

                <div
                  className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-12 md:gap-5"
                  data-testid="grid-agents"
                >
                  <div className="md:col-span-7">
                    <AgentCard
                      agent={AGENTS[0]}
                      selected={selectedId === AGENTS[0].id}
                      onSelect={() => setSelectedId(AGENTS[0].id)}
                      onStart={() => handleStart(AGENTS[0].id)}
                    />
                  </div>
                  <div className="md:col-span-5">
                    <div className="grid gap-4 md:gap-5">
                      <AgentCard
                        agent={AGENTS[1]}
                        selected={selectedId === AGENTS[1].id}
                        onSelect={() => setSelectedId(AGENTS[1].id)}
                        onStart={() => handleStart(AGENTS[1].id)}
                      />
                      <AgentCard
                        agent={AGENTS[2]}
                        selected={selectedId === AGENTS[2].id}
                        onSelect={() => setSelectedId(AGENTS[2].id)}
                        onStart={() => handleStart(AGENTS[2].id)}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="mx-auto mt-8 max-w-5xl rounded-3xl border border-slate-200/60 bg-white/55 p-5 text-right shadow-sm backdrop-blur md:p-6"
                  data-testid="panel-selected"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-600" data-testid="text-selected-label">
                        נבחר עכשיו
                      </div>
                      <div
                        className="mt-1 text-xl font-extrabold text-slate-950"
                        data-testid="text-selected-name"
                      >
                        {selected?.name}
                      </div>
                      <div className="mt-1 text-sm text-slate-600" data-testid="text-selected-role">
                        {selected?.role}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href="#"
                        className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-white"
                        data-testid="link-about"
                        onClick={(e) => e.preventDefault()}
                      >
                        איך זה עובד
                      </a>
                      <a
                        href="#"
                        className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-slate-900"
                        data-testid="link-continue"
                        onClick={(e) => {
                          e.preventDefault();
                          handleStart(selectedId);
                        }}
                      >
                        המשך
                      </a>
                    </div>
                  </div>

                  <div className="mt-4 text-xs leading-relaxed text-slate-500" data-testid="text-disclaimer">
                    האנונימיות חשובה לנו: אין כאן שמות אמיתיים, ואין שום דבר שצריך להופיע על המסך אם זה לא נוח.
                    מצב הסוואה תמיד זמין בפינה.
                  </div>
                </div>

                <footer className="mx-auto mt-10 max-w-5xl pb-10 text-center text-xs text-slate-500">
                  <div data-testid="text-footer">
                    אנונימיות מלאה בעיצוב. הנתונים בדמו הזה נשמרים רק בזיכרון של הדפדפן.
                  </div>
                </footer>
              </div>
            </header>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
