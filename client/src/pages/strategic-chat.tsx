import { useState, useEffect, useRef, useCallback } from "react";
import { apiUrl } from "@/lib/apiBase";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Activity, Menu, Volume2, VolumeX, Plus, FileText, MessageSquare, Brain, Sparkles, AlertTriangle, Target, Upload, Shield, Zap, BookmarkPlus, Check, Radar, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Conversation, ConversationMessage } from "@shared/schema";
import { cn } from "@/lib/utils";

const STOP_TOKEN_MAP: Record<string, string> = {
  ontological: "[ONTOLOGY_END]",
  renaissance: "[RENAISSANCE_END]",
  crisis: "[CRISIS_END]",
  operational: "[FOX_END]",
};

const EXPERTS_CONFIG: Record<string, {
  name: string;
  role: string;
  color: string;
  glow: string;
  border: string;
  ring: string;
  bgColor: string;
  textBg: string;
  icon: typeof Brain;
}> = {
  ontological: {
    name: "המהנדס האונטולוגי",
    role: "SCQA",
    color: "text-blue-300",
    glow: "shadow-blue-500/30",
    border: "border-blue-400",
    ring: "ring-blue-400/40",
    bgColor: "bg-blue-950/40",
    textBg: "bg-blue-950/60",
    icon: Brain,
  },
  renaissance: {
    name: "איש הרנסנס",
    role: "SCAMPER",
    color: "text-yellow-300",
    glow: "shadow-yellow-500/30",
    border: "border-yellow-400",
    ring: "ring-yellow-400/40",
    bgColor: "bg-yellow-950/40",
    textBg: "bg-yellow-950/60",
    icon: Sparkles,
  },
  crisis: {
    name: "מנהל המשברים",
    role: "Pre-Mortem",
    color: "text-red-400",
    glow: "shadow-red-500/30",
    border: "border-red-500",
    ring: "ring-red-500/40",
    bgColor: "bg-red-950/40",
    textBg: "bg-red-950/60",
    icon: AlertTriangle,
  },
  operational: {
    name: "השועל המבצעי",
    role: "SOP",
    color: "text-orange-400",
    glow: "shadow-orange-500/30",
    border: "border-orange-500",
    ring: "ring-orange-500/40",
    bgColor: "bg-orange-950/40",
    textBg: "bg-orange-950/60",
    icon: Target,
  },
};

type MetaAgent = {
  id: string;
  name: string;
  nameHe: string;
  framework: string;
  color: string;
  stopToken?: string;
};

type Turn = { character: string; text: string; stopToken?: string };

const VALID_EXPERT_IDS = new Set(["ontological", "renaissance", "crisis", "operational"]);

function normalizeExpertKey(key: string): string {
  const k = key.toLowerCase().trim();
  if (VALID_EXPERT_IDS.has(k)) return k;
  if (k.includes("אונטולוגי") || k.includes("מהנדס")) return "ontological";
  if (k.includes("רנסנס")) return "renaissance";
  if (k.includes("משבר")) return "crisis";
  if (k.includes("שועל") || k.includes("מבצעי")) return "operational";
  return k;
}

function stripJsonArtifacts(text: string): string {
  return text
    .replace(/\{"character"\s*:.*?"text"\s*:/g, "")
    .replace(/"character"\s*:\s*"[^"]*"\s*,?\s*/g, "")
    .replace(/"text"\s*:\s*"?/g, "")
    .replace(/"stopToken"\s*:\s*"[^"]*"\s*,?\s*/g, "")
    .replace(/"voice_id"\s*:\s*"[^"]*"\s*,?\s*/g, "")
    .replace(/"avatar_id"\s*:\s*"[^"]*"\s*,?\s*/g, "")
    .replace(/"pitch"\s*:\s*[-\d.]+\s*,?\s*/g, "")
    .replace(/[{}[\]]/g, "")
    .replace(/(?<!\w)"(?!\w)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripStopTokens(text: string): string {
  let cleaned = text
    .replace(/\[(?:ONTOLOGY|RENAISSANCE|CRISIS|ARISTOTLE|COACH|FOX)_END\]/g, "")
    .replace(/【H】/g, "")
    .trim();
  if (cleaned.includes('"character"') || cleaned.includes('"text"') || /^\s*[\[{]/.test(cleaned)) {
    cleaned = stripJsonArtifacts(cleaned);
  }
  return cleaned;
}

function renderExpertText(text: string, expertColor: string, expertBgColor: string) {
  let cleaned = text.replace(/\[(?:ONTOLOGY|RENAISSANCE|CRISIS|ARISTOTLE|COACH|FOX)_END\]/g, "").trim();
  if (cleaned.includes('"character"') || cleaned.includes('"text"') || /^\s*[\[{]/.test(cleaned)) {
    cleaned = stripJsonArtifacts(cleaned);
  }
  const lines = cleaned.split("\n");
  const elements: { type: "header" | "text"; content: string }[] = [];
  let currentText = "";

  for (const line of lines) {
    const trimmed = line.trim();
    const isOldHeader = trimmed.startsWith("【H】");
    const isMarkdownHeader = trimmed.startsWith("###");
    const isFoxStep = /^צעד (ראשון מיידי|שני|שלישי|רביעי):/.test(trimmed);
    if (isOldHeader || isMarkdownHeader || isFoxStep) {
      if (currentText.trim()) {
        elements.push({ type: "text", content: currentText.trim() });
        currentText = "";
      }
      const headerText = trimmed.replace("【H】", "").replace(/^###\s*/, "").trim();
      elements.push({ type: "header", content: headerText });
    } else {
      currentText += line + "\n";
    }
  }
  if (currentText.trim()) {
    elements.push({ type: "text", content: currentText.trim() });
  }

  return elements;
}

export default function StrategicChatPage() {
  const [location] = useLocation();
  const { toast } = useToast();

  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const [turnQueue, setTurnQueue] = useState<Turn[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeExperts, setActiveExperts] = useState<string[]>(["ontological", "operational"]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const [captionText, setCaptionText] = useState("");
  const [captionWords, setCaptionWords] = useState<string[]>([]);
  const [visibleWordCount, setVisibleWordCount] = useState(0);
  const captionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showTranscript, setShowTranscript] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [activeMetaAgent, setActiveMetaAgent] = useState<MetaAgent | null>(null);
  const [summaryMode, setSummaryMode] = useState(false);
  const [safetyOverride, setSafetyOverride] = useState(false);
  const [crisisActive, setCrisisActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [savedRuleIds, setSavedRuleIds] = useState<Set<string>>(new Set());
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchCacheRef = useRef<Map<string, string>>(new Map());
  const serverTtsFailedRef = useRef(false);
  const turnFinishedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const [conversationId, setConversationId] = useState<number | null>(null);

  const unlockAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        audioRef.current!.pause();
        audioRef.current!.currentTime = 0;
      }).catch(() => {});
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctx.resume().then(() => ctx.close()).catch(() => {});
    setAudioUnlocked(true);
  }, []);

  useEffect(() => {
    return () => {
      if (captionTimerRef.current) clearInterval(captionTimerRef.current);
      if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src);
      prefetchCacheRef.current.forEach(url => URL.revokeObjectURL(url));
      prefetchCacheRef.current.clear();
    };
  }, []);

  const clearCaption = useCallback(() => {
    if (captionTimerRef.current) {
      clearInterval(captionTimerRef.current);
      captionTimerRef.current = null;
    }
    setCaptionText("");
    setCaptionWords([]);
    setVisibleWordCount(0);
  }, []);

  const startCaptionReveal = useCallback((text: string, durationMs: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    setCaptionWords(words);
    setVisibleWordCount(0);
    setCaptionText(text);

    if (words.length === 0) return;

    const intervalMs = Math.max(80, durationMs / words.length);
    let count = 0;

    if (captionTimerRef.current) clearInterval(captionTimerRef.current);
    captionTimerRef.current = setInterval(() => {
      count++;
      setVisibleWordCount(count);
      if (count >= words.length) {
        if (captionTimerRef.current) clearInterval(captionTimerRef.current);
        captionTimerRef.current = null;
      }
    }, intervalMs);
  }, []);

  const prefetchAudio = useCallback(async (turn: Turn) => {
    if (serverTtsFailedRef.current) return;
    const charKey = normalizeExpertKey(turn.character);
    const cleanedText = stripStopTokens(turn.text);
    const cacheKey = `${charKey}-${cleanedText.substring(0, 50)}`;
    if (prefetchCacheRef.current.has(cacheKey)) return;

    try {
      const res = await apiRequest("POST", "/api/chat/tts", {
        text: cleanedText, role: charKey, conversationId
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      prefetchCacheRef.current.set(cacheKey, url);
    } catch (e) {
      console.warn("Prefetch failed, marking server TTS as unavailable:", e);
      serverTtsFailedRef.current = true;
    }
  }, [conversationId]);

  const turnDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSpeaking && turnQueue.length > 0) {
      if (turnDelayRef.current) clearTimeout(turnDelayRef.current);
      const isFirstTurn = !currentSpeaker;
      const delay = isFirstTurn ? 0 : 700;
      turnDelayRef.current = setTimeout(() => {
        playNextTurn(turnQueue[0]);
        if (turnQueue.length > 1 && !isMuted) {
          prefetchAudio(turnQueue[1]);
        }
      }, delay);
    } else if (!isSpeaking && turnQueue.length === 0 && isProcessing) {
      setIsProcessing(false);
      setStatusLabel("");
      setCurrentSpeaker(null);
      clearCaption();
      setSafetyOverride(false);
      setSummaryMode(false);
      setCrisisActive(false);
    }
    return () => {
      if (turnDelayRef.current) clearTimeout(turnDelayRef.current);
    };
  }, [turnQueue, isSpeaking]);

  const playNextTurn = async (turn: Turn) => {
    const charKey = normalizeExpertKey(turn.character);
    const cleanedText = stripStopTokens(turn.text);
    turnFinishedRef.current = false;
    setIsSpeaking(true);
    setCurrentSpeaker(charKey);

    const newMsg: ConversationMessage = {
      id: `${charKey}-${Date.now()}`,
      role: charKey as any,
      content: turn.text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMsg]);

    if (isMuted) {
      const readTime = Math.max(2000, cleanedText.length * 40);
      startCaptionReveal(cleanedText, readTime);
      setTimeout(() => finishTurn(), readTime);
      return;
    }

    const cacheKey = `${charKey}-${cleanedText.substring(0, 50)}`;
    const cachedUrl = prefetchCacheRef.current.get(cacheKey);

    const useBrowserSpeech = (text: string) => {
      const readTime = Math.max(3000, text.length * 55);
      startCaptionReveal(text, readTime);
      let finished = false;
      const safeFinish = () => {
        if (finished) return;
        finished = true;
        finishTurn();
      };
      if (window.speechSynthesis) {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = "he-IL";
          utterance.rate = 0.9;

          const forceEnd = setTimeout(() => {
            console.log("[Audio] Force-releasing stuck utterance");
            window.speechSynthesis.cancel();
            safeFinish();
          }, Math.max(10000, readTime + 3000));

          utterance.onend = () => {
            clearTimeout(forceEnd);
            console.log("[Audio] Speech finished normally");
            setTimeout(safeFinish, 200);
          };
          utterance.onerror = () => {
            clearTimeout(forceEnd);
            console.log("[Audio] Speech error, releasing");
            safeFinish();
          };
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          setTimeout(safeFinish, readTime + 500);
        }
      } else {
        setTimeout(safeFinish, readTime + 500);
      }
    };

    const playUrl = async (url: string) => {
      if (!audioRef.current) {
        useBrowserSpeech(cleanedText);
        return;
      }
      audioRef.current.src = url;

      const maxWaitMs = Math.max(5000, cleanedText.length * 70) + 3000;
      const safetyTimer = setTimeout(() => {
        finishTurn();
      }, maxWaitMs);

      const clearSafety = () => { clearTimeout(safetyTimer); };

      audioRef.current.onloadedmetadata = () => {
        const durationMs = audioRef.current?.duration
          ? audioRef.current.duration * 1000
          : cleanedText.length * 55;
        startCaptionReveal(cleanedText, durationMs);
      };
      audioRef.current.onended = () => {
        clearSafety();
        finishTurn();
      };
      audioRef.current.onerror = () => {
        clearSafety();
        useBrowserSpeech(cleanedText);
      };
      try {
        await audioRef.current.play();
      } catch (e) {
        clearSafety();
        useBrowserSpeech(cleanedText);
      }
    };

    if (serverTtsFailedRef.current) {
      useBrowserSpeech(cleanedText);
      return;
    }

    if (cachedUrl) {
      prefetchCacheRef.current.delete(cacheKey);
      await playUrl(cachedUrl);
      return;
    }

    try {
      const res = await apiRequest("POST", "/api/chat/tts", {
        text: cleanedText, role: charKey, conversationId
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      await playUrl(url);
    } catch (e) {
      serverTtsFailedRef.current = true;
      useBrowserSpeech(cleanedText);
    }
  };

  const finishTurn = () => {
    if (turnFinishedRef.current) return;
    turnFinishedRef.current = true;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onloadedmetadata = null;
      if (audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current.src = "";
    }
    clearCaption();
    setIsSpeaking(false);
    setTurnQueue(prev => prev.slice(1));
  };

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const fetchConversation = async (id: number) => {
    try {
      const res = await apiRequest("GET", `/api/conversations/${id}`);
      const data = await res.json();
      const normalized = (data.messages || []).map((m: ConversationMessage) => ({
        ...m,
        role: m.role === "user" ? "user" : normalizeExpertKey(m.role),
      }));
      setMessages(normalized);
      setConversationId(id);
    } catch (e) { console.error(e); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(apiUrl("/api/upload"), { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        toast({ title: "הקובץ נטען", description: `${data.filename} - ${data.totalChunks} קטעים נשמרו בזיכרון` });
        queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
      } else {
        toast({ title: "שגיאה", description: data.message || "שגיאה בטעינת הקובץ", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "שגיאה", description: "שגיאה בטעינת הקובץ", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isProcessing) return;
    if (!audioUnlocked) unlockAudio();

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setTurnQueue([]);
    setIsSpeaking(false);
    setCurrentSpeaker(null);
    clearCaption();

    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date().toISOString()
    }]);

    setIsProcessing(true);
    setStatusLabel("הצוות במחשבה...");
    const currentInput = input;
    setInput("");

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput, conversationId })
      });

      if (!response.ok) throw new Error("API Error");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No Reader");

      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const eventBlocks = sseBuffer.split("\n\n");
        sseBuffer = eventBlocks.pop() || "";

        for (const block of eventBlocks) {
          if (!block.trim()) continue;
          const blockLines = block.split("\n");
          let currentEvent = "";
          let dataStr = "";
          for (const line of blockLines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr += line.slice(6);
            }
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);

            if (currentEvent === "safety") {
              setSafetyOverride(true);
            }

            if (currentEvent === "meta_agent" && data.id) {
              setActiveMetaAgent(data);
            }

            if (currentEvent === "experts" && data.selected) {
              setActiveExperts(data.selected);
              if (data.summaryMode) setSummaryMode(true);
              if (data.safetyOverride) setSafetyOverride(true);
              if (data.crisisActive) setCrisisActive(true);
            }

            if (data.conversationId && !conversationId) {
              setConversationId(data.conversationId);
              queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
            }
            if (currentEvent === "scout" && data.active) {
              if (data.cached) {
                toast({ title: "הגשש ההקשרי", description: `טעון ממודיעין מקומי (${data.market_trends?.length || 0} מגמות)` });
              } else {
                toast({ title: "הגשש ההקשרי", description: `זוהו ${data.market_trends?.length || 0} מגמות שוק` });
              }
              queryClient.invalidateQueries({ queryKey: ["/api/scout-logs"] });
            }
            if (data.stage === "monologue") {
              toast({ title: "מסנכרן שרשרת מומחים...", description: "ניתוח עקרונות ראשונים" });
            }
            if (data.stage === "scouting") {
              toast({ title: "הגשש ההקשרי", description: "סורק מגמות שוק..." });
            }
            if (data.stage) setStatusLabel(data.label);

            if (currentEvent === "turn" && data.turn) {
              const normalizedTurn = {
                ...data.turn,
                character: normalizeExpertKey(data.turn.character),
              };
              const turnText = normalizedTurn.text?.replace(/\[(?:ONTOLOGY|RENAISSANCE|CRISIS|FOX)_END\]/g, "").trim();
              if (turnText && turnText.length >= 5) {
                setTurnQueue(prev => [...prev, normalizedTurn]);
              }
            }

            if (data.turns) {
              if (data.dialogueOrder) setActiveExperts(data.dialogueOrder);
              if (data.metaAgent) setActiveMetaAgent(data.metaAgent);
              if (data.summaryMode) setSummaryMode(true);
              if (data.safetyOverride) setSafetyOverride(true);
              const normalizedTurns = data.turns
                .map((t: Turn) => ({
                  ...t,
                  character: normalizeExpertKey(t.character),
                }))
                .filter((t: Turn) => {
                  const cleaned = t.text?.replace(/\[(?:ONTOLOGY|RENAISSANCE|CRISIS|FOX)_END\]/g, "").trim();
                  return cleaned && cleaned.length >= 5;
                });
              setTurnQueue(prev => [...prev, ...normalizedTurns]);
            }
          } catch (e) {}
        }
      }
    } catch (error) {
      setIsProcessing(false);
      toast({ title: "שגיאה", description: "תקלה בתקשורת", variant: "destructive" });
    }
  };

  const copyAll = () => {
    const fullText = messages.map(m => {
      const name = m.role === "user" ? "אני" : (EXPERTS_CONFIG[normalizeExpertKey(m.role)]?.name || m.role);
      return `${name}:\n${stripStopTokens(m.content)}\n`;
    }).join("\n");
    navigator.clipboard.writeText(fullText);
    toast({ title: "הועתק", description: "הפרוטוקול המלא נשמר בלוח" });
  };

  const saveAsRule = async (msgId: string, text: string) => {
    if (savedRuleIds.has(msgId) || savingRuleId === msgId) return;
    setSavingRuleId(msgId);
    try {
      const cleanedText = stripStopTokens(text);
      const res = await apiRequest("POST", "/api/save-rule", { text: cleanedText });
      const data = await res.json();
      if (data.success) {
        setSavedRuleIds(prev => new Set(prev).add(msgId));
        toast({ title: "נשמר כחוק", description: data.rule });
      } else {
        toast({ title: "שגיאה", description: data.message || "לא ניתן לשמור", variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה", description: "תקלה בשמירת החוק", variant: "destructive" });
    } finally {
      setSavingRuleId(null);
    }
  };

  const { data: memoriesData } = useQuery<{ id: number; text: string; category: string; createdAt: string }[]>({
    queryKey: ["/api/memories"],
    enabled: showKnowledge,
  });

  const { data: userProfile } = useQuery<{ topics: string[]; interests: string[]; totalMemories: number; categories: Record<string, number> }>({
    queryKey: ["/api/agent/profile"],
    enabled: showKnowledge,
  });

  const { data: scoutLogs } = useQuery<{ timestamp: string; topic: string; summary: string; source: string; trends: string[] }[]>({
    queryKey: ["/api/scout-logs"],
    enabled: showKnowledge,
  });

  const activeExpertConfig = currentSpeaker
    ? (EXPERTS_CONFIG[currentSpeaker] || EXPERTS_CONFIG["ontological"])
    : EXPERTS_CONFIG["ontological"];

  useEffect(() => {
    if (showTranscript && transcriptEndRef.current && !isSpeaking) {
      setTimeout(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 300);
    }
  }, [messages, showTranscript, isSpeaking]);

  const turnCount = messages.filter(m => m.role !== "user").length;

  return (
    <div className="h-[100dvh] w-screen bg-black text-white font-sans overflow-hidden flex flex-col relative" dir="rtl" data-testid="strategic-chat-page">

      <div className="absolute top-0 w-full px-4 pt-3 z-50 flex justify-between items-center pointer-events-none" dir="rtl">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="pointer-events-auto bg-black/70 border-amber-900/50 text-amber-400" data-testid="button-sidebar-menu">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-neutral-950 border-amber-900/30 text-white w-80">
            <SheetHeader>
              <SheetTitle className="text-amber-400 flex items-center gap-2">
                <Brain className="w-5 h-5" />
                ארכיון המועצה
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <Button onClick={() => window.location.reload()} className="w-full bg-amber-700 text-black font-bold" data-testid="button-new-chat">
                <Plus className="w-4 h-4 ml-2" /> שיחה חדשה
              </Button>
              <Button onClick={copyAll} variant="outline" className="w-full border-amber-900/50 text-amber-300" data-testid="button-copy-all">
                <FileText className="w-4 h-4 ml-2" /> העתק פרוטוקול מלא
              </Button>
              <Button
                variant="outline"
                className="w-full border-amber-900/50 text-amber-300"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-upload-file"
              >
                <Upload className="w-4 h-4 ml-2" />
                {isUploading ? "טוען..." : "טען קובץ לזיכרון"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.md,.csv"
                className="hidden"
                onChange={handleFileUpload}
                data-testid="input-file-upload"
              />

              <div className="text-[10px] text-amber-700 font-bold tracking-wide mt-6 mb-2">שיחות אחרונות</div>
              <ScrollArea className="h-[50vh]">
                <div className="space-y-1">
                  {conversations?.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => { setConversationId(conv.id); fetchConversation(conv.id); }}
                      className={cn(
                        "p-3 rounded-md cursor-pointer transition-colors text-sm border border-transparent",
                        conversationId === conv.id ? "bg-amber-950/50 border-amber-800/40" : "hover-elevate"
                      )}
                      data-testid={`conversation-item-${conv.id}`}
                    >
                      <div className="font-medium truncate text-amber-100">{conv.title || "שיחה ללא שם"}</div>
                      <div className="text-xs text-amber-800">{new Date(conv.createdAt).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2 pointer-events-auto">
          <AnimatePresence>
            {safetyOverride && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                data-testid="safety-indicator"
              >
                <Badge variant="outline" className="border-red-500 text-red-400 bg-red-950/60 text-[9px] font-black no-default-active-elevate">
                  <Shield className="w-3 h-3 ml-1" />
                  בטיחות
                </Badge>
              </motion.div>
            )}
            {summaryMode && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                data-testid="summary-mode-indicator"
              >
                <Badge variant="outline" className="border-purple-500 text-purple-400 bg-purple-950/60 text-[9px] font-black no-default-active-elevate">
                  <Zap className="w-3 h-3 ml-1" />
                  תמצית
                </Badge>
              </motion.div>
            )}
            {crisisActive && !safetyOverride && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                data-testid="crisis-active-indicator"
              >
                <Badge variant="outline" className="border-crimson text-red-300 bg-red-950/40 text-[9px] font-black no-default-active-elevate" style={{ borderColor: "crimson" }}>
                  <AlertTriangle className="w-3 h-3 ml-1" />
                  משברים פעיל
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="outline"
            size="icon"
            className={cn("bg-black/70 border-amber-900/50", showKnowledge ? "text-green-300" : "text-amber-700")}
            onClick={() => { setShowKnowledge(!showKnowledge); if (showTranscript) setShowTranscript(false); }}
            data-testid="button-toggle-knowledge"
          >
            <Brain className="h-4 w-4" />
          </Button>
          {turnCount > 0 && (
            <Button
              variant="outline"
              size="icon"
              className={cn("bg-black/70 border-amber-900/50", showTranscript ? "text-amber-300" : "text-amber-700")}
              onClick={() => { setShowTranscript(!showTranscript); if (showKnowledge) setShowKnowledge(false); }}
              data-testid="button-toggle-transcript"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="bg-black/70 border-amber-900/50 text-amber-400"
            onClick={() => setIsMuted(!isMuted)}
            data-testid="button-mute-toggle"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="pt-14 pb-1 px-4 z-20">
        <div className="flex justify-center gap-4">
          {activeExperts.map((expertKey) => {
            const expert = EXPERTS_CONFIG[expertKey];
            if (!expert) return null;
            const isActive = currentSpeaker === expertKey;
            const ExpertIcon = expert.icon;

            return (
              <div key={expertKey} className="flex flex-col items-center gap-1 transition-all duration-500" data-testid={`expert-story-${expertKey}`}>
                <div className={cn(
                  "w-12 h-12 rounded-full border-2 flex items-center justify-center relative transition-all duration-500",
                  isActive
                    ? `${expert.border} scale-125 shadow-lg ${expert.glow} bg-neutral-900`
                    : "border-neutral-800 opacity-40 bg-neutral-950"
                )}>
                  <ExpertIcon className={cn("w-5 h-5", expert.color)} />
                  {isActive && (
                    <div className="absolute -bottom-1.5 bg-red-600 text-[7px] font-black text-white px-1.5 py-0.5 rounded-full animate-pulse tracking-wider">
                      שידור
                    </div>
                  )}
                </div>
                <span className={cn("text-[8px] font-bold tracking-wide transition-all text-center max-w-16 leading-tight", isActive ? expert.color : "text-neutral-700")}>
                  {expert.name.split(" ").slice(-1)[0]}
                </span>
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {activeMetaAgent && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-center mt-2"
              data-testid="meta-agent-indicator"
            >
              <div className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-bold tracking-wide",
                EXPERTS_CONFIG[activeMetaAgent.id]?.border || "border-amber-500",
                EXPERTS_CONFIG[activeMetaAgent.id]?.bgColor || "bg-amber-950/40",
                EXPERTS_CONFIG[activeMetaAgent.id]?.color || "text-amber-400"
              )}>
                {EXPERTS_CONFIG[activeMetaAgent.id]?.icon && (() => {
                  const Icon = EXPERTS_CONFIG[activeMetaAgent.id].icon;
                  return <Icon className="w-3 h-3" />;
                })()}
                <span>{activeMetaAgent.nameHe}</span>
                <span className="opacity-50">|</span>
                <span className="opacity-70 text-[10px]">{activeMetaAgent.framework}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSpeaker || "idle"}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4 z-10"
          >
            <div className={cn(
              "w-36 h-36 md:w-48 md:h-48 rounded-full border-[3px] flex items-center justify-center transition-all duration-500 relative",
              currentSpeaker
                ? `${activeExpertConfig.border} shadow-2xl ${activeExpertConfig.glow} bg-neutral-900`
                : "border-neutral-800 bg-neutral-950 opacity-40"
            )} data-testid="main-stage-avatar">
              {currentSpeaker ? (() => {
                const Icon = activeExpertConfig.icon;
                return <Icon className={cn("w-16 h-16 md:w-20 md:h-20", activeExpertConfig.color, "drop-shadow-lg")} />;
              })() : (
                <Brain className="w-16 h-16 md:w-20 md:h-20 text-amber-500/30" />
              )}
              {currentSpeaker && (
                <>
                  <div className={cn("absolute inset-0 rounded-full border-2 animate-ping opacity-20", activeExpertConfig.border)} />
                  <div className={cn("absolute inset-[-6px] rounded-full border opacity-10", activeExpertConfig.border)} />
                </>
              )}
            </div>

            <div className="text-center">
              <h2 className={cn(
                "font-black tracking-tight drop-shadow-md",
                currentSpeaker ? "text-xl " + activeExpertConfig.color : "text-4xl text-amber-500"
              )} data-testid="text-current-speaker">
                {currentSpeaker ? activeExpertConfig.name : "החדר בהמתנה"}
              </h2>
              {currentSpeaker && (
                <p className="text-[10px] text-neutral-500 font-bold tracking-wide mt-1 flex items-center justify-center gap-1.5">
                  <Mic className="w-3 h-3 text-red-500 animate-pulse" /> משדר
                </p>
              )}
              {!currentSpeaker && !isProcessing && !audioUnlocked && (
                <Button
                  onClick={unlockAudio}
                  className="mt-3 bg-amber-700 text-black font-black text-sm tracking-wide px-6 rounded-full border-2 border-amber-500 shadow-lg shadow-amber-900/30 animate-pulse"
                  data-testid="button-start-comm"
                >
                  <Volume2 className="w-4 h-4 ml-2" />
                  התחל שידור
                </Button>
              )}
              {!currentSpeaker && !isProcessing && audioUnlocked && (
                <p className="text-lg font-bold tracking-wide text-amber-600 mt-1" data-testid="text-standby-label">ממתין</p>
              )}
              {isProcessing && !currentSpeaker && (
                <div className="mt-3 text-amber-400 text-sm font-bold animate-pulse flex items-center justify-center gap-2" data-testid="text-processing-status">
                  <Activity className="w-4 h-4" />
                  {statusLabel}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {captionText && currentSpeaker && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-24 left-4 right-4 z-[55] flex justify-center pointer-events-none"
            data-testid="caption-overlay"
          >
            <div className={cn(
              "max-w-xl w-full backdrop-blur-md rounded-xl px-6 py-4 shadow-2xl border",
              activeExpertConfig.textBg,
              activeExpertConfig.border,
            )}>
              <span className={cn("text-[10px] font-bold tracking-wide block mb-2", activeExpertConfig.color)}>
                {activeExpertConfig.name}
                {summaryMode && <span className="mr-2 text-purple-400">[תמצית]</span>}
              </span>
              <p className="text-[15px] leading-relaxed text-neutral-100 font-medium" dir="rtl" data-testid="caption-text">
                {captionWords.slice(0, visibleWordCount).join(" ").replace(/【H】/g, "")}
                {visibleWordCount < captionWords.length && (
                  <span className="inline-block w-0.5 h-4 bg-amber-400 mr-1 animate-pulse align-middle" />
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", damping: 25 }}
            className="absolute inset-x-0 bottom-20 top-16 z-30 bg-black/95 backdrop-blur-xl border-t border-amber-900/30 flex flex-col"
            data-testid="transcript-panel"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
              <span className="text-xs text-amber-600 font-bold tracking-wide">פרוטוקול שיחה</span>
              <Button variant="ghost" size="sm" onClick={() => setShowTranscript(false)} className="text-neutral-500 text-xs">
                סגור
              </Button>
            </div>
            <ScrollArea className="flex-1 px-4 py-3">
              <div className="space-y-3 max-w-2xl mx-auto">
                {messages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  const normalizedRole = !isUser ? normalizeExpertKey(msg.role) : "user";
                  const expert = !isUser ? EXPERTS_CONFIG[normalizedRole] : null;
                  const displayText = !isUser ? stripStopTokens(msg.content) : msg.content;
                  const hasStopToken = !isUser && Object.values(STOP_TOKEN_MAP).some(t => msg.content.includes(t));

                  return (
                    <div
                      key={index}
                      className={cn(
                        "text-sm rounded-lg p-3 border",
                        isUser ? "text-right border-blue-900/30 bg-blue-950/20" : `${expert?.border || "border-neutral-800"} ${expert?.bgColor || "bg-neutral-950/50"}`,
                      )}
                      data-testid={`transcript-msg-${index}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={cn("text-[10px] font-bold tracking-wide flex items-center gap-1", isUser ? "text-blue-400" : expert?.color)}>
                          {!isUser && expert?.icon && (() => {
                            const Icon = expert.icon;
                            return <Icon className="w-3 h-3" />;
                          })()}
                          {isUser ? "אני" : expert?.name || normalizedRole}
                        </span>
                        {hasStopToken && (
                          <span className="text-[8px] text-neutral-600 font-mono">
                            {STOP_TOKEN_MAP[normalizedRole] || ""}
                          </span>
                        )}
                      </div>
                      {isUser ? (
                        <p className="leading-relaxed text-blue-200">{displayText}</p>
                      ) : (() => {
                        const elements = renderExpertText(msg.content, expert?.color || "text-neutral-300", expert?.bgColor || "bg-neutral-950/50");
                        return (
                          <div className="space-y-1.5" style={{ overflow: "visible" }}>
                            {elements.map((el, ei) => el.type === "header" ? (
                              <div
                                key={ei}
                                className={cn(
                                  "text-[11px] font-black tracking-wide py-1 px-2 rounded-md mt-1",
                                  expert?.bgColor || "bg-neutral-800",
                                  expert?.color || "text-neutral-300",
                                  "border-r-2",
                                  expert?.border || "border-neutral-600"
                                )}
                              >
                                {el.content}
                              </div>
                            ) : (
                              <p key={ei} className="leading-relaxed text-neutral-300 whitespace-pre-wrap text-sm">
                                {el.content}
                              </p>
                            ))}
                          </div>
                        );
                      })()}
                      {!isUser && (
                        <div className="flex justify-end mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "text-[10px] gap-1 h-6 px-2",
                              savedRuleIds.has(msg.id)
                                ? "text-green-400 cursor-default"
                                : "text-neutral-500 hover:text-amber-400"
                            )}
                            onClick={() => saveAsRule(msg.id, msg.content)}
                            disabled={savedRuleIds.has(msg.id) || savingRuleId === msg.id}
                            data-testid={`button-save-rule-${index}`}
                          >
                            {savedRuleIds.has(msg.id) ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>נשמר</span>
                              </>
                            ) : savingRuleId === msg.id ? (
                              <span className="animate-pulse">שומר...</span>
                            ) : (
                              <>
                                <BookmarkPlus className="w-3 h-3" />
                                <span>שמור כחוק</span>
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKnowledge && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", damping: 25 }}
            className="absolute inset-x-0 bottom-20 top-16 z-30 bg-black/95 backdrop-blur-xl border-t border-green-900/30 flex flex-col"
            data-testid="knowledge-panel"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
              <span className="text-xs text-green-500 font-bold tracking-wide flex items-center gap-2">
                <Brain className="w-3 h-3" />
                מפת זיכרון
              </span>
              <Button variant="ghost" size="sm" onClick={() => setShowKnowledge(false)} className="text-neutral-500 text-xs" data-testid="button-close-knowledge">
                סגור
              </Button>
            </div>
            <ScrollArea className="flex-1 px-4 py-3">
              <div className="max-w-2xl mx-auto space-y-4">
                {scoutLogs && scoutLogs.length > 0 && (
                  <div className="border border-cyan-900/30 rounded-md p-4 space-y-3" data-testid="scout-logs-section">
                    <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                      <Radar className="w-4 h-4" />
                      מודיעין עדכני
                    </h3>
                    <div className="text-[10px] text-neutral-500 font-bold tracking-wide">
                      {scoutLogs.length} סריקות אחרונות
                    </div>
                    <div className="space-y-2">
                      {scoutLogs.map((log, i) => {
                        const logTime = new Date(log.timestamp);
                        const minutesAgo = Math.floor((Date.now() - logTime.getTime()) / 60000);
                        const timeLabel = minutesAgo < 1 ? "עכשיו" : minutesAgo < 60 ? `לפני ${minutesAgo} דק'` : `${logTime.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;

                        return (
                          <div key={i} className="border border-cyan-900/20 rounded-md p-3 bg-cyan-950/20" data-testid={`scout-log-${i}`}>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-[11px] font-bold text-cyan-300 truncate">{log.topic}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {log.source === "cached" && (
                                  <Badge variant="outline" className="text-[8px] border-amber-800 text-amber-400 no-default-active-elevate px-1.5 py-0">
                                    <Database className="w-2.5 h-2.5 ml-0.5" />
                                    מטמון
                                  </Badge>
                                )}
                                <span className="text-[9px] text-neutral-600">{timeLabel}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {log.trends.map((trend, ti) => (
                                <Badge key={ti} variant="outline" className="text-[9px] border-cyan-800/50 text-cyan-300/80 no-default-active-elevate" data-testid={`scout-trend-${i}-${ti}`}>
                                  {trend.length > 50 ? trend.substring(0, 50) + "..." : trend}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {userProfile && (
                  <div className="border border-green-900/30 rounded-md p-4 space-y-3" data-testid="user-profile-section">
                    <h3 className="text-sm font-bold text-green-400 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      פרופיל משתמש
                    </h3>
                    <div className="text-xs text-neutral-400">
                      סה"כ זיכרונות: <span className="text-green-300 font-bold" data-testid="text-memory-count">{userProfile.totalMemories}</span>
                    </div>
                    {userProfile.topics.length > 0 && (
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold tracking-wide mb-1">נושאים מרכזיים</div>
                        <div className="flex flex-wrap gap-1">
                          {userProfile.topics.map((topic, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] border-green-800 text-green-300 no-default-active-elevate" data-testid={`badge-topic-${i}`}>
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {userProfile.interests.length > 0 && (
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold tracking-wide mb-1">תחומי עניין</div>
                        <div className="flex flex-wrap gap-1">
                          {userProfile.interests.map((interest, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] border-blue-800 text-blue-300 no-default-active-elevate" data-testid={`badge-interest-${i}`}>
                              {interest}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {Object.keys(userProfile.categories).length > 0 && (
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold tracking-wide mb-1">קטגוריות מומחים</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(userProfile.categories).map(([cat, count]) => {
                            const expertCfg = EXPERTS_CONFIG[cat];
                            return (
                              <div key={cat} className={cn("flex items-center gap-1 text-[10px]", expertCfg?.color || "text-neutral-400")} data-testid={`category-${cat}`}>
                                {expertCfg && (() => {
                                  const Icon = expertCfg.icon;
                                  return <Icon className="w-3 h-3" />;
                                })()}
                                <span>{expertCfg?.name || cat}</span>
                                <span className="opacity-50">({count})</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-green-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    זיכרונות אחרונים
                  </h3>
                  {(!memoriesData || memoriesData.length === 0) && (
                    <p className="text-xs text-neutral-600 italic" data-testid="text-no-memories">אין זיכרונות עדיין. שלחו הודעה כדי להתחיל לבנות את מפת הזיכרון.</p>
                  )}
                  {memoriesData?.slice(0, 20).map((mem) => {
                    const expertCfg = EXPERTS_CONFIG[mem.category];
                    return (
                      <div key={mem.id} className={cn(
                        "border rounded-md p-3 text-xs",
                        expertCfg?.border || "border-neutral-800",
                        expertCfg?.bgColor || "bg-neutral-950/50"
                      )} data-testid={`memory-item-${mem.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className={cn("flex items-center gap-1 text-[10px] font-bold", expertCfg?.color || "text-neutral-500")}>
                            {expertCfg && (() => {
                              const Icon = expertCfg.icon;
                              return <Icon className="w-3 h-3" />;
                            })()}
                            {expertCfg?.name || mem.category}
                          </div>
                          <span className="text-[9px] text-neutral-700">{new Date(mem.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-neutral-300 leading-relaxed">{mem.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-[60] px-4 pb-4 pt-2 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="max-w-xl mx-auto relative flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1.5 focus-within:border-amber-700/60 transition-all shadow-lg shadow-black/50">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
            <Mic className="w-4 h-4 text-neutral-600" />
          </div>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            className="border-0 bg-transparent text-white placeholder:text-neutral-600 focus-visible:ring-0 h-10 text-base shadow-none"
            placeholder="שדר פקודה למועצה..."
            disabled={isProcessing}
            data-testid="input-chat-message"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isProcessing}
            size="icon"
            className={cn("rounded-full shrink-0", input.trim() ? "bg-amber-600 text-black" : "bg-neutral-800 text-neutral-600")}
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <audio
        ref={audioRef}
        className="hidden"
      />
    </div>
  );
}
