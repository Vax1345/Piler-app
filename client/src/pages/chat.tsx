import { useEffect, useRef, useState, useCallback } from "react";
import { apiUrl } from "@/lib/apiBase";
import { useRoute, useLocation } from "wouter";
import {
  Send,
  Eye,
  Newspaper,
  Shield,
  Zap,
  Sparkles,
  MoreVertical,
  ChevronRight,
  Mic,
  MicOff,
  Copy,
  Check,
  FileText,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import adlerImage from "@assets/unnamed_(2)_1770132119550.jpg";
import foxImage from "@assets/u5297525132_A_dynamic_high-energy_CGI_portrait_of_Fox_a_sharp__1770132119541.png";
import noaImage from "@assets/u5297525132_A_hyper-realistic_portrait_of_Noa_a_woman_in_her___1770132119618.png";

type Message = {
  id: string | number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type AgentConfig = {
  id: string;
  name: string;
  role: string;
  color: string;
  bgColor: string;
  borderColor: string;
  pageBg: string;
  icon: any;
  image: string;
  initialMessage: string;
};

const AGENTS: Record<string, AgentConfig> = {
  adler: {
    id: "adler",
    name: "פרופ' אדלר",
    role: "משילות השכל. רמב\"ם, ניטשה, מילשטיין.",
    color: "text-[#1e3a5f]",
    bgColor: "bg-[#c8d6e8]",
    borderColor: "border-[#1e3a5f]/30",
    pageBg: "bg-gradient-to-b from-[#e8eef5] to-[#f0f4f8]",
    icon: Shield,
    image: adlerImage,
    initialMessage: "שלום... אני פרופסור אדלר. הרמב\"ם לימד שהשכל חייב לשלוט בדמיון. הצג בפניי את הנושא, ונבחן אותו דרך שלוש שכבות הניתוח.",
  },
  focus: {
    id: "focus",
    name: "Focus",
    role: "חשיפת טעות התכנון. חריף ונוקב.",
    color: "text-[#6b5b4f]",
    bgColor: "bg-[#e0d6cc]",
    borderColor: "border-[#6b5b4f]/30",
    pageBg: "bg-gradient-to-b from-[#f5f0eb] to-[#faf7f4]",
    icon: Zap,
    image: foxImage,
    initialMessage: "קדימה. מה הנושא? איפה ההבטחה ואיפה המציאות? תן עובדות.",
  },
  noa: {
    id: "noa",
    name: "נועה",
    role: "חדשנות משבשת כחוק טבע.",
    color: "text-[#5c6b4a]",
    bgColor: "bg-[#d4dcc8]",
    borderColor: "border-[#5c6b4a]/30",
    pageBg: "bg-gradient-to-b from-[#f0f3eb] to-[#f7f9f4]",
    icon: Sparkles,
    image: noaImage,
    initialMessage: "היי! אני נועה. ספר לי מה הנושא. אני אחפש את הכוח המשבש שעומד לשנות את כל המשחק.",
  },
};

function ChatMessage({ 
  message, 
  agent, 
  onCopy,
  copied,
  onCopyForNarration,
  narrationCopied,
}: { 
  message: Message; 
  agent: AgentConfig;
  onCopy: (text: string, id: string) => void;
  copied: boolean;
  onCopyForNarration: (text: string, id: string) => void;
  narrationCopied: boolean;
}) {
  const isUser = message.role === "user";
  const msgId = String(message.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex w-full gap-3 group ${isUser ? "flex-row-reverse" : "flex-row"}`}
      data-testid={`message-${message.id}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border overflow-hidden ${
          isUser ? "bg-slate-200 border-slate-300" : `${agent.bgColor} border-slate-100`
        }`}
        data-testid={`avatar-${isUser ? "user" : "agent"}`}
      >
        {isUser ? (
          <span className="text-xs font-bold text-slate-600">אני</span>
        ) : (
          <img src={agent.image} alt={agent.name} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="relative max-w-[85%]">
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
            isUser
              ? "bg-slate-900 text-white rounded-tr-sm"
              : "bg-white text-slate-800 border border-slate-100 rounded-tl-sm"
          }`}
          data-testid={`message-content-${message.id}`}
        >
          {message.content}
        </div>
        <div className={`flex items-center gap-2 mt-1 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-[10px] text-slate-400">
            {message.timestamp.toLocaleTimeString("he-IL", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            onClick={() => onCopy(message.content, msgId)}
            className="opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-100"
            data-testid={`button-copy-${message.id}`}
            title="העתק טקסט"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3 text-slate-400" />
            )}
          </button>
          {!isUser && (
            <button
              onClick={() => onCopyForNarration(message.content, msgId)}
              className="opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-100 flex items-center gap-1"
              data-testid={`button-copy-narration-${message.id}`}
              title="העתק טקסט לקריינות"
            >
              {narrationCopied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <FileText className="h-3 w-3 text-slate-400" />
              )}
              <span className="text-[9px] text-slate-400">קריינות</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CamouflageOverlay({ onExit }: { onExit: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-white text-right font-sans"
      dir="rtl"
      data-testid="overlay-camouflage"
    >
      <header className="flex items-center justify-between border-b px-4 py-3 bg-white/80 backdrop-blur sticky top-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-slate-200" />
          <div>
            <div className="text-sm font-bold text-slate-900">חדשות היום</div>
            <div className="text-xs text-slate-500">לפני 2 דקות</div>
          </div>
        </div>
        <button
          onClick={onExit}
          className="p-2 text-slate-400 hover:text-slate-600"
          data-testid="button-exit-camouflage-chat"
        >
          <Newspaper className="h-5 w-5" />
        </button>
      </header>
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2 border-b border-slate-100 pb-4 last:border-0">
            <div className="h-4 bg-slate-100 rounded w-3/4" />
            <div className="h-3 bg-slate-50 rounded w-full" />
            <div className="h-3 bg-slate-50 rounded w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/chat/:agentId");
  const agentId = params?.agentId || "adler";
  const agent = AGENTS[agentId] || AGENTS.adler;

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [camouflage, setCamouflage] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [narrationCopiedId, setNarrationCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setMessages([
      {
        id: "initial",
        role: "assistant",
        content: agent.initialMessage,
        timestamp: new Date(),
      },
    ]);
  }, [agent.initialMessage]);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const copyForNarration = useCallback((text: string, id: string) => {
    const cleanText = text
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\[.*?\]/g, "")
      .replace(/---+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    
    navigator.clipboard.writeText(cleanText).then(() => {
      setNarrationCopiedId(id);
      setTimeout(() => setNarrationCopiedId(null), 2000);
    });
  }, []);

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim()) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agentId, message: messageText }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const data = await response.json();
      
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.text,
          timestamp: new Date(),
        },
      ]);
      setIsTyping(false);
    } catch (error) {
      console.error("Error sending message:", error);
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "מצטער/ת, הייתה בעיה בשליחת ההודעה. נסה/י שוב.",
          timestamp: new Date(),
        },
      ]);
    }
  }, [agentId]);

  const toggleSpeechRecognition = useCallback(() => {
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    
    if (!SpeechRecognition) {
      setInput("הדפדפן לא תומך בזיהוי קול");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'he-IL';
    recognition.continuous = false;
    recognition.interimResults = true;
    
    let baseInput = input;
    let finalTranscript = '';
    
    recognition.onstart = () => {
      setIsRecording(true);
      baseInput = input;
      finalTranscript = '';
    };
    
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript = transcript;
        }
      }
      const separator = baseInput.trim() ? ' ' : '';
      setInput(baseInput + separator + transcript);
    };
    
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      if (finalTranscript.trim()) {
        const fullMessage = baseInput.trim() ? baseInput + ' ' + finalTranscript : finalTranscript;
        setTimeout(() => sendMessage(fullMessage.trim()), 300);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
      recognitionRef.current = null;
    };
    
    recognition.start();
  }, [isRecording, input, sendMessage]);

  const handleSend = () => {
    sendMessage(input);
  };

  return (
    <div className={`relative flex h-[100dvh] flex-col font-sans ${agent.pageBg}`} dir="rtl" data-testid="page-chat">
      <AnimatePresence>
        {camouflage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CamouflageOverlay onExit={() => setCamouflage(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/60 bg-white/80 px-4 py-3 backdrop-blur-md" data-testid="header-chat">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-slate-500"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
          
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border overflow-hidden ${agent.bgColor} ${agent.borderColor}`} data-testid={`icon-agent-${agent.id}`}>
              <img src={agent.image} alt={agent.name} className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight" data-testid="text-agent-name">{agent.name}</h1>
              <span className="text-xs text-slate-500 flex items-center gap-1" data-testid="status-online">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {agent.role}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-slate-400"
                onClick={() => setCamouflage(true)}
                data-testid="button-camouflage-chat"
              >
                <Eye className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>מצב הסוואה</p>
            </TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-slate-400"
            data-testid="button-menu"
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 bg-slate-50 px-4 py-6" data-testid="chat-messages">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-4">
          <div className="flex justify-center">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-500" data-testid="text-date">
              היום, {new Date().toLocaleDateString("he-IL")}
            </span>
          </div>

          {messages.map((msg) => (
            <ChatMessage 
              key={msg.id} 
              message={msg} 
              agent={agent} 
              onCopy={copyToClipboard}
              copied={copiedId === String(msg.id)}
              onCopyForNarration={copyForNarration}
              narrationCopied={narrationCopiedId === String(msg.id)}
            />
          ))}

          {isTyping && (
            <div className="flex w-full gap-3" data-testid="indicator-typing">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border overflow-hidden ${agent.bgColor} border-slate-100`}>
                <img src={agent.image} alt={agent.name} className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm border border-slate-100">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="bg-white px-4 py-3 border-t border-slate-100 sticky bottom-0 z-10" data-testid="input-area">
        <div className="mx-auto max-w-2xl relative flex items-center gap-2">
          <Button
            onClick={toggleSpeechRecognition}
            size="icon"
            className={`absolute right-1.5 top-1.5 h-9 w-9 rounded-xl transition-all ${
              isRecording 
                ? "bg-blue-600 text-white shadow-md animate-pulse" 
                : "bg-slate-100 text-slate-500"
            }`}
            data-testid="button-mic"
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={isRecording ? "מקשיב..." : `כתוב הודעה ל${agent.name}...`}
            className={`pr-12 pl-12 py-6 rounded-2xl border-slate-200 focus:ring-slate-200 focus:border-slate-300 transition-all text-base shadow-inner ${
              isRecording ? "bg-blue-50 border-blue-200" : "bg-slate-50"
            }`}
            autoFocus
            data-testid="input-message"
          />
          <Button 
            onClick={handleSend}
            size="icon"
            className={`absolute left-1.5 top-1.5 h-9 w-9 rounded-xl transition-all ${
              input.trim() 
                ? "bg-slate-900 text-white shadow-md" 
                : "bg-slate-100 text-slate-300"
            }`}
            disabled={!input.trim()}
            data-testid="button-send"
          >
            <Send className="h-4 w-4 rtl:-scale-x-100" />
          </Button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-slate-400" data-testid="text-security">המצפן האסטרטגי - אקלים אסטרטגי וכוחות יסודיים</p>
        </div>
      </div>
    </div>
  );
}
