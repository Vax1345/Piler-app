import { Shield, ArrowLeft, Calendar, User, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { type SharedConversation } from "@shared/schema";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logoImage from "@assets/LOGO_1769887292071.jpg";

const AGENTS = {
  noa: { name: "נועה", role: "תמיכה רגשית", bg: "bg-pink-50", icon: <Shield className="text-pink-500" /> },
  focus: { name: "פוקס", role: "אימון פרודוקטיביות", bg: "bg-orange-50", icon: <Shield className="text-orange-500" /> },
  adler: { name: "פרופ' אדלר", role: "מומחה להתמכרויות", bg: "bg-indigo-50", icon: <Shield className="text-indigo-500" /> },
};

export default function SharedConversationPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: conv, isLoading, error } = useQuery<SharedConversation>({
    queryKey: [`/api/share/${id}`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (error || !conv) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">השיחה לא נמצאה</h1>
        <p className="text-slate-600 mb-6">ייתכן שהקישור לא תקין או שהשיחה הוסרה.</p>
        <Button onClick={() => setLocation("/")}>חזרה לדף הבית</Button>
      </div>
    );
  }

  const agent = AGENTS[conv.agent as keyof typeof AGENTS];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-right pb-12" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logoImage} alt="NexStep" className="h-10" />
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900">שיחה משותפת</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/")} className="rounded-xl">
            <ArrowLeft className="w-4 h-4 ml-2" />
            צור שיחה משלך
          </Button>
        </header>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
          <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl", agent.bg)}>
                {agent.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{agent.name}</h2>
                <p className="text-sm text-slate-500">{agent.role}</p>
              </div>
            </div>
            <div className="text-left text-slate-400 text-xs">
              <div className="flex items-center justify-end gap-1 mb-1">
                <Calendar size={12} />
                {new Date(conv.createdAt).toLocaleDateString('he-IL')}
              </div>
              <div className="flex items-center justify-end gap-1">
                <Clock size={12} />
                {new Date(conv.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {(conv.messages as any[]).map((msg, i) => (
              <div key={i} className={cn("flex items-start gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1", msg.role === "user" ? "bg-slate-100 text-slate-500" : agent.bg)}>
                  {msg.role === "user" ? <User size={16} /> : agent.icon}
                </div>
                <div className={cn("max-w-[85%] p-4 rounded-2xl shadow-sm", 
                  msg.role === "user" ? "bg-slate-900 text-white rounded-tr-none" : "bg-white border border-slate-100 text-slate-800 rounded-tl-none"
                )}>
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-8 bg-slate-50 border-t border-slate-100 text-center">
            <h3 className="text-lg font-bold text-slate-900 mb-2">גם אתם יכולים לקבל תמיכה כזו</h3>
            <p className="text-slate-600 mb-6">הסוכנים שלנו זמינים עבורכם 24/7 לכל נושא.</p>
            <Button onClick={() => setLocation("/")} size="lg" className="rounded-2xl px-8 bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200 transition-all hover:scale-105 active:scale-95">
              התחל שיחה חדשה עכשיו
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
