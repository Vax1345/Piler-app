import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wrench, Volume2, VolumeX, Menu, X, Clock, Copy, Check,
  Send, ScanLine, ImageIcon, FlashlightOff, Mic, MicOff,
  Flashlight, AudioLines, ShoppingCart, Ruler, Crosshair, Eye,
  CameraOff, Info, ArrowRight, Camera, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/apiBase";

function getOrCreateSessionId(): string {
  const KEY = "cap_session_id";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length > 10) return existing;
  } catch {}
  const id = crypto.randomUUID ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
      });
  try { localStorage.setItem(KEY, id); } catch {}
  return id;
}
import { cn } from "@/lib/utils";

type TabId = "consult" | "repair" | "acoustic" | "measure";
type ViewId = "dashboard" | "repair" | "consult" | "acoustic" | "measure";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageDataUrl?: string;
  timestamp: string;
};

type HistoryEntry = {
  id: string;
  date: string;
  category: string;
  description: string;
  messages: ChatMessage[];
  conversationId?: number | null;
};

const MAX_RECORD_SECONDS = 15;

const HISTORY_KEY = "PLIER_history";

function loadHistory(): HistoryEntry[] {
  try {
    let raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      raw = localStorage.getItem("PLIER history") || localStorage.getItem("PLIER");
      if (raw) {
        localStorage.setItem(HISTORY_KEY, raw);
        localStorage.removeItem("PLIER history");
        localStorage.removeItem("PLIER");
      }
    }
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    const stripped = entries.slice(0, 50).map(e => ({
      ...e,
      messages: e.messages.map(m => ({ ...m, imageDataUrl: undefined })),
    }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stripped));
  } catch (err) {
    console.error("Storage full", err);
    try {
      const minimal = entries.slice(0, 10).map(e => ({
        ...e,
        messages: e.messages.slice(-6).map(m => ({ ...m, imageDataUrl: undefined })),
      }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(minimal));
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }
}

function stripStopTokens(text: string): string {
  return text
    .replace(/\[(?:ONTOLOGY|RENAISSANCE|CRISIS|ARISTOTLE|COACH|FOX|CAP_DIY)_END\]/g, "")
    .replace(/【H】/g, "")
    .replace(/###\s*/g, "")
    .replace(/\*\*\*/g, "").replace(/\*\*/g, "").replace(/\*/g, "")
    .replace(/```[\s\S]*?```/g, "").replace(/`([^`]*)`/g, "$1")
    .replace(/---+/g, "").replace(/\.{3,}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function speakWithBestVoice(text: string, onStart?: () => void, onEnd?: () => void) {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const voices = window.speechSynthesis.getVoices();
    const hebrewMale = voices.find(v => v.lang.startsWith("he") && v.name.toLowerCase().includes("male"))
      || voices.find(v => v.lang.startsWith("he"))
      || null;
    const chunks = text.split(/(?<=[.!?،,\n])\s*/).filter(c => c.trim().length > 0);
    if (chunks.length > 0 && onStart) onStart();
    const speakChunks = (index: number) => {
      if (index >= chunks.length) { if (onEnd) onEnd(); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = "he-IL";
      utterance.rate = 1.0;
      utterance.pitch = 0.8;
      if (hebrewMale) utterance.voice = hebrewMale;
      utterance.onend = () => speakChunks(index + 1);
      utterance.onerror = () => speakChunks(index + 1);
      window.speechSynthesis.speak(utterance);
    };
    speakChunks(0);
  } catch { if (onEnd) onEnd(); }
}

const TAB_CONFIG: { id: TabId; label: string; icon: typeof Wrench }[] = [
  { id: "consult", label: "ייעוץ", icon: ShoppingCart },
  { id: "repair", label: "תיקון", icon: Wrench },
  { id: "acoustic", label: "רעשים", icon: AudioLines },
  { id: "measure", label: "מדידה", icon: Ruler },
];

export default function CapPage() {
  const { toast } = useToast();
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentView, setCurrentView] = useState<ViewId>("dashboard");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecordingTime, setAudioRecordingTime] = useState(0);
  const [cameraVisible, setCameraVisible] = useState(true);
  const [latestSubtitle, setLatestSubtitle] = useState<string | null>(null);
  const [emptyStateVisible, setEmptyStateVisible] = useState(true);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [isPlayingModalAudio, setIsPlayingModalAudio] = useState(false);
  const [infoTooltip, setInfoTooltip] = useState<TabId | null>(null);
  const [historyAccordion, setHistoryAccordion] = useState<string | null>(null);
  const [manualCameraStarted, setManualCameraStarted] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [tooltipAudioPlaying, setTooltipAudioPlaying] = useState<TabId | null>(null);
  const tooltipAudioRef = useRef<HTMLAudioElement | null>(null);
  const modalAudioRef = useRef<HTMLAudioElement | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<number | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string>(Date.now().toString());
  const clientSessionId = useRef<string>(getOrCreateSessionId());
  const recognitionRef = useRef<any>(null);
  const pendingVoiceSubmitRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const tabNeedsCamera = currentView === "repair" || currentView === "measure" || (currentView === "consult" && manualCameraStarted);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      setTorchOn(false);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const caps = videoTrack.getCapabilities?.();
          setTorchSupported(!!(caps && (caps as any).torch));
        } catch { setTorchSupported(false); }
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      const isPermissionDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError" ||
        (err instanceof DOMException && (err.name === "NotAllowedError" || err.message?.includes("Permission denied")));
      if (isPermissionDenied) {
        setCameraPermissionDenied(true);
      }
      setCameraError("לא ניתן לגשת למצלמה. ודא שנתת הרשאה.");
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    const newState = !torchOn;
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: newState } as any] });
      setTorchOn(newState);
    } catch (err) { console.error("Torch toggle failed:", err); }
  }, [torchOn]);

  const captureFrame = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) { console.warn("[Capture] No canvas ref"); return null; }
    if (!cameraActive || !streamRef.current) { console.warn("[Capture] Camera not active or no stream"); return null; }

    const allVideos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
    const readyVideo = allVideos.find(v => v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0 && !v.paused);
    const fallbackVideo = document.querySelector('video[data-testid="video-camera-feed"]') as HTMLVideoElement
      || document.querySelector('video[data-testid="video-measure-feed"]') as HTMLVideoElement
      || videoRef.current;
    const video = readyVideo || fallbackVideo;

    if (!video) { console.warn("[Capture] No video element found"); return null; }
    if (video.readyState < 2) { console.warn("[Capture] Video not ready, readyState:", video.readyState); return null; }

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { console.warn("[Capture] No canvas context"); return null; }
    ctx.drawImage(video, 0, 0, w, h);

    const pixel = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data;
    const isBlack = pixel[0] + pixel[1] + pixel[2] < 15;
    if (isBlack) {
      console.warn("[Capture] Black frame detected, retrying with stream track...");
      const track = streamRef.current?.getVideoTracks()[0];
      if (track && "ImageCapture" in window) {
        try {
          const ic = new (window as any).ImageCapture(track);
          ic.grabFrame().then((bitmap: ImageBitmap) => {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx2 = canvas.getContext("2d");
            if (ctx2) {
              ctx2.drawImage(bitmap, 0, 0);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
              setLastCapture(dataUrl);
              sendMessage("", dataUrl);
            }
            bitmap.close();
          }).catch((err: any) => console.error("[Capture] ImageCapture failed:", err));
          return null;
        } catch (e) { console.error("[Capture] ImageCapture init failed:", e); }
      }
      return null;
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    console.log("[Capture] Success, size:", Math.round(dataUrl.length / 1024), "KB");
    setLastCapture(dataUrl);
    return dataUrl;
  }, [cameraActive]);

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "שגיאה", description: "התמונה גדולה מדי (מקסימום 10MB)", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLastCapture(dataUrl);
      sendMessage("", dataUrl);
    };
    reader.readAsDataURL(file);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  useEffect(() => {
    if (currentView === "dashboard") {
      stopCamera();
    }
  }, [currentView]);

  useEffect(() => {
    if ((currentView === "repair" || currentView === "measure" || currentView === "acoustic") && cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [currentView, cameraActive]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("cap_active_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.messages?.length > 0) {
          setMessages(parsed.messages);
          if (parsed.sessionId) sessionIdRef.current = parsed.sessionId;
          if (parsed.conversationId) conversationIdRef.current = parsed.conversationId;
          if (parsed.currentView && parsed.currentView !== "dashboard") setCurrentView(parsed.currentView);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (currentView !== "dashboard" && messages.length > 0) {
      try {
        const stripped = messages.map(m => ({ ...m, imageDataUrl: undefined }));
        sessionStorage.setItem("cap_active_session", JSON.stringify({
          currentView, sessionId: sessionIdRef.current,
          conversationId: conversationIdRef.current, messages: stripped,
        }));
      } catch {}
    }
  }, [messages, currentView]);

  useEffect(() => {
    const pending = pendingVoiceSubmitRef.current;
    if (pending && !isProcessing) {
      pendingVoiceSubmitRef.current = null;
      sendMessage(pending);
    }
  }, [input]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopCamera();
      if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
      if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) setEmptyStateVisible(false);
  }, [messages]);

  useEffect(() => {
    if (window.speechSynthesis) window.speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    let failures = 0;
    const pingInterval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl("/api/ping"), { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          failures = 0;
        } else {
          failures++;
        }
      } catch {
        failures++;
        console.warn(`[KeepAlive] Ping failed (${failures})`);
      }
      if (failures >= 3) {
        console.warn("[KeepAlive] Multiple ping failures, connection may be stale");
        failures = 0;
      }
    }, 25000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetch(apiUrl("/api/ping"), { signal: AbortSignal.timeout(5000) }).catch(() => {
          console.warn("[KeepAlive] Reconnect ping after tab resume failed");
        });
        if (isProcessing) {
          console.warn("[KeepAlive] Tab resumed while processing, resetting state");
          setIsProcessing(false);
          abortRef.current?.abort();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(pingInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isProcessing]);

  const getTabContext = (view: TabId): string => {
    switch (view) {
      case "consult": return "ייעוץ וקניות";
      case "repair": return "הדרכת תיקון";
      case "acoustic": return "זיהוי רעשים";
      case "measure": return "מדידה חכמה";
    }
  };

  const sendMessage = async (textInput?: string, imageDataUrl?: string, audioData?: string) => {
    const text = (textInput !== undefined ? textInput : input).trim();
    const image = imageDataUrl || null;
    const audio = audioData || null;
    if (!text && !image && !audio) return;
    if (isProcessing) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(), role: "user",
      text: text || (audio ? "(הקלטת רעש לאבחון)" : "(סריקת תמונה)"),
      imageDataUrl: image || undefined, timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    if (image) setLastCapture(null);
    setIsProcessing(true);
    setLatestSubtitle(null);
    scrollToBottom();

    const tabContext = getTabContext(currentView as TabId);
    const photoDesc = image ? "(צורפה תמונה חיה מהמצלמה - נתח אותה בקפידה)" : "";
    const measureCtx = currentView === "measure" ? " (המשתמש מבקש מדידה - חפש אובייקט ייחוס כמו כרטיס אשראי או מטבע 10 שקל)" : "";
    const acousticCtx = currentView === "acoustic" ? " (הקלטת רעש לאבחון - נתח את הצליל)" : "";
    const fullMessage = text
      ? `[קטגוריה: ${tabContext}] ${text} ${photoDesc}${measureCtx}${acousticCtx}`
      : `[קטגוריה: ${tabContext}] ${image ? "סרוק את התמונה ותן הנחיות." : ""}${audio ? "נתח את הרעש המוקלט." : ""} ${photoDesc}${measureCtx}${acousticCtx}`;

    const controller = new AbortController();
    abortRef.current = controller;
    const fetchTimeout = setTimeout(() => {
      console.warn("[SSE] Request timeout after 90s, aborting");
      controller.abort();
    }, 90000);

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          conversationId: conversationIdRef.current,
          imageBase64: image,
          audioBase64: audio,
          sessionId: clientSessionId.current,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("API Error");
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No Reader");

      let sseBuffer = "";
      let responseText = "";
      let audioBase64Response: string | null = null;
      let lastChunkTime = Date.now();

      while (true) {
        const readPromise = reader.read();
        const timeoutPromise = new Promise<{done: true, value: undefined}>((resolve) => {
          setTimeout(() => resolve({ done: true, value: undefined }), 60000);
        });
        const { done, value } = await Promise.race([readPromise, timeoutPromise]);
        if (done) break;
        lastChunkTime = Date.now();
        sseBuffer += decoder.decode(value, { stream: true });
        const eventBlocks = sseBuffer.split("\n\n");
        sseBuffer = eventBlocks.pop() || "";

        for (const block of eventBlocks) {
          if (!block.trim()) continue;
          const blockLines = block.split("\n");
          let currentEvent = "";
          let dataStr = "";
          for (const line of blockLines) {
            if (line.startsWith("event: ")) currentEvent = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr += line.slice(6);
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (data.conversationId) conversationIdRef.current = data.conversationId;
            if (data.audioBase64) audioBase64Response = data.audioBase64;
            if (currentEvent === "turn" && data.turn) {
              const turnText = stripStopTokens(data.turn.text || "");
              if (turnText.length >= 5) responseText += (responseText ? "\n\n" : "") + turnText;
            }
            if (currentEvent === "result" && !responseText && data.turns && Array.isArray(data.turns)) {
              for (const t of data.turns) {
                const turnText = stripStopTokens(t.text || "");
                if (turnText.length >= 5) responseText += (responseText ? "\n\n" : "") + turnText;
              }
            }
          } catch {}
        }
      }

      if (responseText) {
        const cleanedResponse = stripStopTokens(responseText);
        setLatestSubtitle(cleanedResponse);
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(), role: "assistant",
          text: cleanedResponse, timestamp: new Date().toISOString(),
        };
        setMessages(prev => {
          const updated = [...prev, assistantMsg];
          const entry: HistoryEntry = {
            id: sessionIdRef.current,
            date: new Date().toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
            category: currentView as TabId,
            description: messages.length === 0 ? (text || "סריקת תמונה") : (messages[0]?.text || "סריקה"),
            messages: updated,
            conversationId: conversationIdRef.current,
          };
          const existingIdx = history.findIndex(h => h.id === sessionIdRef.current);
          let newHistory: HistoryEntry[];
          if (existingIdx >= 0) { newHistory = [...history]; newHistory[existingIdx] = entry; }
          else { newHistory = [entry, ...history]; }
          setHistory(newHistory);
          saveHistory(newHistory);
          return updated;
        });
        scrollToBottom();

        if (!isMuted) {
          if (audioBase64Response) {
            try {
              const binaryStr = atob(audioBase64Response);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const mimeType = (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) ? "audio/mpeg" : "audio/wav";
              const audioBlob = new Blob([bytes], { type: mimeType });
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              setIsSpeaking(true);
              audio.onended = () => { URL.revokeObjectURL(audioUrl); setIsSpeaking(false); };
              audio.play().catch((playErr) => {
                console.warn("[Audio] Playback failed, falling back to browser TTS:", playErr);
                URL.revokeObjectURL(audioUrl);
                setIsSpeaking(false);
                speakWithBestVoice(cleanedResponse, () => setIsSpeaking(true), () => setIsSpeaking(false));
              });
            } catch (decodeErr) {
              console.warn("[Audio] Failed to decode audio base64:", decodeErr);
              speakWithBestVoice(cleanedResponse, () => setIsSpeaking(true), () => setIsSpeaking(false));
            }
          } else {
            speakWithBestVoice(cleanedResponse, () => setIsSpeaking(true), () => setIsSpeaking(false));
          }
        }
      } else {
        toast({ title: "שגיאה", description: "לא התקבלה תשובה", variant: "destructive" });
      }
    } catch (err: any) {
      clearTimeout(fetchTimeout);
      if (err?.name === "AbortError") {
        console.warn("[SSE] Request aborted");
        return;
      }
      console.error("[SSE] Fetch error:", err);
      toast({ title: "שגיאה", description: "תקלה בתקשורת עם המערכת. נסו שוב.", variant: "destructive" });
    } finally {
      clearTimeout(fetchTimeout);
      setIsProcessing(false);
      scrollToBottom();
    }
  };

  const handleScan = () => {
    if (!cameraVisible) {
      setCameraVisible(true);
      toast({ title: "המצלמה הופעלה", description: "לחץ שוב על סרוק כשהמצלמה מוכנה" });
      return;
    }
    const frame = captureFrame();
    if (frame) {
      sendMessage("", frame);
    } else if (cameraActive) {
      toast({ title: "רגע", description: "המצלמה עדיין נטענת, נסה שוב עוד שנייה" });
    }
  };

  const handleSend = () => { if (input.trim()) sendMessage(input); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const toggleVoiceInput = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "לא נתמך", description: "הדפדפן לא תומך בקלט קולי", variant: "destructive" }); return; }
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); return; }
    const recognition = new SR();
    recognition.lang = "he-IL"; recognition.continuous = false; recognition.interimResults = true; recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t; else interim = t;
      }
      setInput(finalTranscript + interim);
    };
    recognition.onend = () => {
      setIsListening(false); recognitionRef.current = null;
      if (finalTranscript.trim()) { pendingVoiceSubmitRef.current = finalTranscript.trim(); setInput(finalTranscript.trim()); }
    };
    recognition.onerror = (event: any) => {
      setIsListening(false); recognitionRef.current = null;
      if (event.error === "not-allowed") toast({ title: "שגיאה", description: "לא ניתנה הרשאה למיקרופון", variant: "destructive" });
    };
    try { recognition.start(); setIsListening(true); } catch { setIsListening(false); recognitionRef.current = null; }
  }, [isListening, toast]);

  const pendingAudioRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingAudioRef.current && !isProcessing) {
      const audio = pendingAudioRef.current;
      pendingAudioRef.current = null;
      sendMessage("(הקלטת רעש לאבחון - האזן ונתח את הרעש)", undefined, audio);
    }
  }, [isProcessing]);

  const sendAudioMessage = useCallback(async (audioBlob: Blob) => {
    console.log(`[Audio Record] Blob received: size=${audioBlob.size}, type=${audioBlob.type}`);
    if (audioBlob.size < 100) {
      console.warn("[Audio Record] Blob too small, ignoring");
      return;
    }
    const fileReader = new FileReader();
    fileReader.onloadend = () => {
      const base64 = fileReader.result as string;
      console.log(`[Audio Record] Base64 data URL length: ${base64.length}, prefix: ${base64.substring(0, 60)}`);
      if (isProcessing) {
        pendingAudioRef.current = base64;
      } else {
        sendMessage("(הקלטת רעש לאבחון - האזן ונתח את הרעש)", undefined, base64);
      }
    };
    fileReader.onerror = () => {
      console.error("[Audio Record] FileReader error:", fileReader.error);
    };
    fileReader.readAsDataURL(audioBlob);
  }, [isProcessing]);

  const stopAudioRecording = useCallback(() => {
    if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try { mediaRecorderRef.current.requestData(); } catch {}
      mediaRecorderRef.current.stop();
    } else {
      if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
    }
    setIsRecordingAudio(false);
    setAudioRecordingTime(0);
  }, []);

  const toggleAudioRecording = useCallback(async () => {
    if (isRecordingAudio) { stopAudioRecording(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: false, echoCancellation: false, autoGainControl: false }
      });
      audioStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      console.log(`[Audio Record] Starting MediaRecorder with MIME: ${mimeType}`);
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          console.log(`[Audio Record] Chunk received: ${e.data.size} bytes (total chunks: ${audioChunksRef.current.length})`);
        }
      };
      recorder.onstop = () => {
        console.log(`[Audio Record] Recorder stopped. Total chunks: ${audioChunksRef.current.length}`);
        if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log(`[Audio Record] Final blob: size=${blob.size}, type=${blob.type}`);
        if (blob.size > 0) sendAudioMessage(blob);
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
      };
      recorder.start(1000);
      setIsRecordingAudio(true);
      setAudioRecordingTime(0);
      let elapsed = 0;
      audioTimerRef.current = setInterval(() => {
        elapsed += 1;
        setAudioRecordingTime(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) stopAudioRecording();
      }, 1000);
    } catch (err) {
      console.error("Audio recording error:", err);
      if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
      toast({ title: "שגיאה", description: "לא ניתן להפעיל הקלטת שמע", variant: "destructive" });
    }
  }, [isRecordingAudio, isProcessing, toast, sendAudioMessage, stopAudioRecording]);

  const copyChat = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msgId);
      toast({ title: "הועתק", description: "ההדרכה הועתקה ללוח" });
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => toast({ title: "שגיאה", description: "לא ניתן להעתיק", variant: "destructive" }));
  };

  const newSession = () => {
    setMessages([]); setLatestSubtitle(null); setEmptyStateVisible(true); setInput("");
    setIsProcessing(false); setLastCapture(null);
    conversationIdRef.current = null; sessionIdRef.current = Date.now().toString();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    try { sessionStorage.removeItem("cap_active_session"); } catch {}
  };

  const enterTool = async (tool: TabId) => {
    const cameraTools: TabId[] = ["repair", "measure", "consult"];
    if (cameraTools.includes(tool)) {
      try {
        const permResult = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (permResult.state === "denied") {
          setCameraPermissionDenied(true);
          return;
        }
      } catch {}
    }
    setCurrentView(tool);
    newSession();
    setManualCameraStarted(false);
    window.history.pushState({ view: tool }, "");
  };

  const goHome = () => {
    stopCamera();
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
    setIsListening(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
    if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null; }
    setIsRecordingAudio(false);
    setAudioRecordingTime(0);
    setIsSpeaking(false);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setCurrentView("dashboard");
    setMessages([]);
    setLatestSubtitle(null);
    setEmptyStateVisible(true);
    setInput("");
    setIsProcessing(false);
    setLastCapture(null);
    setManualCameraStarted(false);
    conversationIdRef.current = null;
    sessionIdRef.current = Date.now().toString();
    try { sessionStorage.removeItem("cap_active_session"); } catch {}
  };

  const openHistoryItem = (entry: HistoryEntry) => {
    setMessages(entry.messages); sessionIdRef.current = entry.id;
    conversationIdRef.current = entry.conversationId ?? null;
    const targetView = entry.category as TabId;
    if (entry.category && TAB_CONFIG.some(t => t.id === entry.category)) {
      setCurrentView(targetView);
      setManualCameraStarted(false);
      window.history.pushState({ view: targetView }, "");
    }
    setMenuOpen(false); setEmptyStateVisible(false);
    setLatestSubtitle(entry.messages.filter(m => m.role === "assistant").pop()?.text || null);
    scrollToBottom();
  };

  const startNewChat = () => {
    sessionIdRef.current = Date.now().toString();
    conversationIdRef.current = null;
    setMessages([]); setLatestSubtitle(null); setEmptyStateVisible(true);
    setMenuOpen(false);
  };

  const deleteHistoryItem = (id: string) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated); saveHistory(updated);
  };

  const recordProgress = audioRecordingTime / MAX_RECORD_SECONDS;
  const circumference = 2 * Math.PI * 48;

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (currentView !== "dashboard") {
        goHome();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentView]);

  const [cameraDeniedByBrowser, setCameraDeniedByBrowser] = useState(false);

  useEffect(() => {
    if (cameraPermissionDenied) {
      const audio = new Audio("/noa-modal.mp3");
      modalAudioRef.current = audio;
      audio.onended = () => setIsPlayingModalAudio(false);
      audio.play().then(() => {
        setIsPlayingModalAudio(true);
      }).catch(() => {
        setIsPlayingModalAudio(false);
      });
      try {
        navigator.permissions.query({ name: "camera" as PermissionName }).then((result) => {
          setCameraDeniedByBrowser(result.state === "denied");
        }).catch(() => {});
      } catch {}
      return () => { audio.pause(); audio.src = ""; modalAudioRef.current = null; setIsPlayingModalAudio(false); };
    } else {
      setCameraDeniedByBrowser(false);
    }
  }, [cameraPermissionDenied]);

  useEffect(() => {
    if (latestSubtitle) {
      const timer = setTimeout(() => setLatestSubtitle(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [latestSubtitle]);

  const renderSubtitle = () => (
    <AnimatePresence>
      {latestSubtitle && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="pointer-events-none px-3 pb-2" data-testid="subtitle-overlay">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 pointer-events-auto max-h-[4.5rem] overflow-hidden" onClick={() => setLatestSubtitle(null)}>
            <p className="text-sm font-bold text-white leading-snug text-center line-clamp-2" data-testid="text-subtitle-line">
              {latestSubtitle.replace(/\n/g, " ").trim()}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderSoundwave = () => (
    isSpeaking ? (
      <div className="flex justify-center pointer-events-none px-3 pb-2" data-testid="soundwave-indicator">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2">
          <div className="flex items-center gap-1 justify-center">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div key={i} className="w-[3px] bg-emerald-400 rounded-full"
                animate={{ height: [4, Math.random() * 20 + 6, 4] }}
                transition={{ duration: 0.4 + Math.random() * 0.3, repeat: Infinity, ease: "easeInOut", delay: i * 0.06 }} />
            ))}
          </div>
        </div>
      </div>
    ) : null
  );

  const renderProcessing = (label: string = "בודק...") => (
    isProcessing ? (
      <div className="flex justify-center pointer-events-none px-3 pb-2" data-testid="processing-indicator">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center gap-2">
          <video autoPlay muted loop playsInline className="w-8 h-8 rounded-md object-cover" data-testid="processing-logo-video">
            <source src="/logo-spin.mp4" type="video/mp4" />
          </video>
          <span className="text-xs text-neutral-300 font-bold">{label}</span>
        </div>
      </div>
    ) : null
  );

  const renderChatInput = (placeholder: string) => (
    <div className="shrink-0 bg-neutral-950 border-t border-neutral-800/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          className={cn(
            "flex-1 min-h-[40px] max-h-[60px] rounded-xl bg-neutral-900 border text-white placeholder:text-neutral-600 px-3.5 py-2.5 text-sm leading-relaxed focus:outline-none resize-none transition-colors",
            isListening ? "border-red-500/60" : "border-neutral-800 focus:border-emerald-700/60"
          )}
          placeholder={isListening ? "מקשיב..." : placeholder}
          disabled={isProcessing}
          data-testid="input-chat-message"
        />
        <Button size="icon" onClick={toggleVoiceInput} disabled={isProcessing}
          className={cn("rounded-xl shrink-0", isListening ? "bg-red-600 text-white animate-pulse" : "bg-neutral-800 text-neutral-400")}
          data-testid="button-mic">
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>
        <Button size="icon" onClick={handleSend} disabled={!input.trim() || isProcessing}
          className={cn("rounded-xl shrink-0", input.trim() && !isProcessing ? "bg-emerald-600 text-white" : "bg-neutral-800 text-neutral-600")}
          data-testid="button-send">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] w-screen bg-black text-white font-sans flex flex-col overflow-hidden" dir="rtl" data-testid="cap-page">
      {showWelcome && (
        <div className="fixed inset-0 text-white flex flex-col items-center justify-center px-6" style={{ zIndex: 9999, background: "rgba(0, 0, 0, 0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }} dir="rtl" data-testid="onboarding-screen">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-md w-full space-y-6 text-center">
            <div className="space-y-4">
              <h1 className="text-5xl font-black tracking-tight" style={{ color: "#ff6b2b", textShadow: "0 2px 20px rgba(255,107,43,0.4)" }} data-testid="splash-brand-name">פלאייר</h1>
              <div className="flex justify-center">
                <video autoPlay muted loop playsInline className="w-48 h-48 rounded-3xl object-cover" style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }} data-testid="splash-logo-video">
                  <source src="/logo-spin.mp4" type="video/mp4" />
                </video>
              </div>
              <p className="text-lg text-neutral-300 leading-relaxed px-2" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }} data-testid="text-onboarding-subtitle">
                היי, אני נועה ואני כאן בשביל לחסוך לכם מאות שקלים על טכנאים. במקום להסתבך, פשוט תבחרו את הכלי שאתם צריכים, תפתחו מצלמה או מיקרופון, ואני אדריך אתכם צעד-צעד. קלי קלות.
              </p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={async () => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({
                  video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
                  audio: true,
                });
                stream.getAudioTracks().forEach(t => t.stop());
                streamRef.current = stream;
                if (videoRef.current) videoRef.current.srcObject = stream;
                setCameraActive(true);
                setCameraError(null);
                setCameraPermissionDenied(false);
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                  try { const caps = videoTrack.getCapabilities?.(); setTorchSupported(!!(caps && (caps as any).torch)); } catch {}
                }
                stopCamera();
                setShowWelcome(false);
              } catch (err: any) {
                console.error("Permission error on welcome:", err);
                setCameraPermissionDenied(true);
              }
            }} className="w-full py-4 rounded-2xl bg-emerald-600 text-white text-xl font-black shadow-lg shadow-emerald-900/40 transition-colors" data-testid="button-start-onboarding">
              יאללה, כנסו לארגז הכלים
            </motion.button>
          </motion.div>
        </div>
      )}
      <AnimatePresence>
        {cameraPermissionDenied && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 text-white flex flex-col items-center justify-center px-5"
            style={{ zIndex: 10000, background: "rgba(0, 0, 0, 0.88)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
            dir="rtl" data-testid="camera-permission-modal">
            <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}
              className="max-w-sm w-full rounded-3xl overflow-hidden"
              style={{ background: "rgba(25, 25, 25, 0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05) inset" }}>
              <div className="px-6 pt-8 pb-2 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
                  className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05))", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                  <CameraOff className="w-9 h-9 text-red-400" />
                </motion.div>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                  if (modalAudioRef.current) {
                    if (isPlayingModalAudio) {
                      modalAudioRef.current.pause();
                      modalAudioRef.current.currentTime = 0;
                      setIsPlayingModalAudio(false);
                    } else {
                      modalAudioRef.current.currentTime = 0;
                      modalAudioRef.current.play().catch(() => {});
                      setIsPlayingModalAudio(true);
                      modalAudioRef.current.onended = () => setIsPlayingModalAudio(false);
                    }
                  } else {
                    const audio = new Audio("/noa-modal.mp3");
                    modalAudioRef.current = audio;
                    audio.play().catch(() => {});
                    setIsPlayingModalAudio(true);
                    audio.onended = () => setIsPlayingModalAudio(false);
                  }
                }}
                  className={cn(
                    "w-full py-3 rounded-2xl text-sm font-black mb-5 flex items-center justify-center gap-2 transition-all",
                    isPlayingModalAudio
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 animate-pulse"
                      : "bg-neutral-800/80 text-neutral-300 border border-neutral-700/50"
                  )}
                  data-testid="button-play-noa-audio">
                  {isPlayingModalAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  {isPlayingModalAudio ? "השתק" : "לחצו לשמוע את נועה"}
                </motion.button>
                <h2 className="text-2xl font-black leading-tight mb-3" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }} data-testid="text-permission-denied-title">
                  בלי עיניים אני לא יכולה לעזור...
                </h2>
                <p className="text-[13px] text-neutral-300 leading-relaxed" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
                  שמעו, כדי שאוכל להגיד בדיוק איזה בורג לפתוח בלי שנעשה נזק, אני חייבת להציץ על התקלה. זה כמו לנסות לתקן מנוע בחושך! קליק קטן על אישור המצלמה, ונתקתק עבודה בלי לצאת פראיירים. אל תהיו כבדים!
                </p>
                {cameraDeniedByBrowser && (
                  <div className="mt-3 bg-yellow-900/30 border border-yellow-700/40 rounded-xl p-3" data-testid="lock-icon-warning">
                    <p className="text-[12px] text-yellow-300 leading-relaxed text-right" dir="rtl">
                      שמנו לב שהדפדפן שלכם חוסם את המצלמה. כדי לתקן: לחצו על סמל המנעול למעלה בשורת הכתובת של הדפדפן -{">"} הרשאות -{">"} אשרו את המצלמה, ורעננו את העמוד.
                    </p>
                  </div>
                )}
              </div>
              <div className="px-6 pb-6 pt-4 space-y-3">
                <motion.button whileTap={{ scale: 0.97 }} onClick={(e) => {
                  e.stopPropagation();
                  if (modalAudioRef.current) { modalAudioRef.current.pause(); modalAudioRef.current.currentTime = 0; }
                  setIsPlayingModalAudio(false);
                  setCameraPermissionDenied(false);
                  setShowWelcome(false);
                }} className="w-full py-4 rounded-2xl bg-emerald-600 text-white text-lg font-black shadow-lg shadow-emerald-900/40 transition-colors" data-testid="button-retry-permission">
                  יאללה, הבנתי
                </motion.button>
                <button onClick={(e) => {
                  e.stopPropagation();
                  if (modalAudioRef.current) { modalAudioRef.current.pause(); modalAudioRef.current.currentTime = 0; }
                  setIsPlayingModalAudio(false);
                  setCameraPermissionDenied(false);
                  setShowWelcome(false);
                }} className="w-full py-2 text-sm text-neutral-500 font-bold" data-testid="button-skip-permission">
                  אולי אחר כך
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleGallerySelect} data-testid="input-gallery-file" />

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setMenuOpen(false)} data-testid="menu-overlay" />
            <motion.div initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: 300 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-[85vw] max-w-sm bg-neutral-900 border-r border-neutral-800 z-[70] flex flex-col" dir="rtl" data-testid="menu-sidebar">
              <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                <h2 className="text-lg font-black text-emerald-400">פלאייר</h2>
                <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)} data-testid="button-close-menu"><X className="h-4 w-4 text-neutral-400" /></Button>
              </div>
              <div className="p-3 space-y-1 border-b border-neutral-800">
                <button onClick={() => { setMenuOpen(false); goHome(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right text-sm font-bold text-neutral-300 hover-elevate" data-testid="menu-home">
                  <Wrench className="w-4 h-4 text-emerald-400" />מסך ראשי
                </button>
                <button onClick={() => setHistoryAccordion(historyAccordion === "history" ? null : "history")}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-right text-sm font-bold text-neutral-300 hover-elevate" data-testid="menu-history">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-neutral-400" />
                    <span>היסטוריית תיקונים</span>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-neutral-500 transition-transform", historyAccordion === "history" && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {historyAccordion === "history" && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden" data-testid="history-accordion">
                      <div className="pr-7 space-y-1.5 py-1">
                        {history.length === 0 && (
                          <p className="text-[11px] text-neutral-600 px-3 py-2">אין היסטוריה עדיין</p>
                        )}
                        {history.slice(0, 10).map((entry) => {
                          const tabInfo = TAB_CONFIG.find(t => t.id === entry.category);
                          const TabIcon = tabInfo?.icon || Wrench;
                          return (
                            <div key={entry.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-neutral-800/40 cursor-pointer hover-elevate"
                              onClick={() => openHistoryItem(entry)} role="button" tabIndex={0}
                              onKeyDown={(e) => { if (e.key === "Enter") openHistoryItem(entry); }}
                              data-testid={`history-item-${entry.id}`}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <TabIcon className="w-3 h-3 text-neutral-500 shrink-0" />
                                <span className="text-[11px] text-neutral-400 truncate">{entry.description || tabInfo?.label}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-neutral-600">{entry.date}</span>
                                <div role="button" tabIndex={0} className="p-0.5 rounded text-neutral-600 cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); deleteHistoryItem(entry.id); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); deleteHistoryItem(entry.id); } }}
                                  data-testid={`button-delete-history-${entry.id}`}>
                                  <X className="w-3 h-3" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right text-sm font-bold text-neutral-500" data-testid="menu-settings">
                  <ScanLine className="w-4 h-4 text-neutral-600" />הגדרות
                </button>
                <button onClick={() => { setMenuOpen(false); setShowAbout(true); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right text-sm font-bold text-neutral-300 hover-elevate" data-testid="menu-about">
                  <Eye className="w-4 h-4 text-emerald-400" />אודות
                </button>
              </div>
              <div className="px-3 pt-3">
                <Button variant="outline" className="w-full rounded-xl border-emerald-700/50 text-emerald-400 font-bold text-xs" onClick={startNewChat} data-testid="button-new-chat">
                  <Wrench className="w-3.5 h-3.5 ml-1.5" />שיחה חדשה
                </Button>
              </div>
              <div className="flex-1" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAbout && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-6"
            onClick={() => setShowAbout(false)} data-testid="about-overlay">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="relative rounded-2xl p-6 max-w-sm w-full z-10"
              style={{ background: "rgba(25, 25, 25, 0.9)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.1)" }}
              onClick={(e) => e.stopPropagation()} data-testid="about-card">
              <h2 className="text-xl font-black text-emerald-400 mb-4 text-center" data-testid="text-about-title">אודות</h2>
              <div className="space-y-3 text-sm text-neutral-200 leading-relaxed" dir="rtl" data-testid="text-about-content">
                <p className="font-bold">נעים מאוד, אנחנו פלאייר.</p>
                <p>האפליקציה הזו נולדה מתוך תסכול ישראלי אמיתי: נמאס לנו לשלם מאות שקלים לטכנאים על תיקונים של 5 דקות. אז יצרנו את נועה – המדריכה הראשונה שלא נותנת לכם לצאת פראיירים, ועוזרת לכם לתקן הכל לבד בבית.</p>
                <p>יש לכם רעיונות לשיפור? מצאתם באג? דברו איתנו, אנחנו קוראים הכל.</p>
              </div>
              <button onClick={() => setShowAbout(false)} className="mt-5 w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black" data-testid="button-close-about">סגור</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 relative overflow-hidden">

        {currentView === "dashboard" && (
          <div className="absolute inset-0 flex flex-col bg-black" data-testid="view-dashboard">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 h-14">
              <Button variant="ghost" size="icon" className="text-neutral-400" onClick={() => setMenuOpen(true)} data-testid="button-menu-dashboard">
                <Menu className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2.5" data-testid="logo-area">
                <img src="/logo.jpg" alt="פלאייר" className="w-10 h-10 rounded-lg object-cover" data-testid="dashboard-logo" />
                <span className="text-lg font-black tracking-tight" style={{ color: "#ff6b2b", textShadow: "0 1px 8px rgba(255,107,43,0.3)" }}>פלאייר</span>
              </div>
              <div className="w-9" />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <h1 className="text-2xl font-black text-white mb-6 text-center" data-testid="text-dashboard-title">
                אהלן, מה מתקנים היום?
              </h1>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { id: "repair" as TabId, icon: Wrench, title: "תיקון בלייב", desc: "בואו נראה על מה אנחנו מסתכלים", color: "16, 185, 129", iconClass: "text-emerald-400", borderColor: "rgba(16, 185, 129, 0.2)", info: "כוונו את המצלמה לתקלה ונועה תדריך אתכם צעד-צעד בתיקון, כולל זיהוי חלקים ומחירים." },
                  { id: "acoustic" as TabId, icon: AudioLines, title: "זיהוי רעשים", desc: "המנוע מזייף? תנו לי להקשיב", color: "239, 68, 68", iconClass: "text-red-400", borderColor: "rgba(239, 68, 68, 0.2)", info: "הקליטו רעש של מכשיר ונועה תזהה בדיוק איזה רכיב כושל ומה צריך להחליף." },
                  { id: "measure" as TabId, icon: Ruler, title: "מדידה חכמה", desc: "עזבו סרט מידה, אני על זה", color: "168, 85, 247", iconClass: "text-purple-400", borderColor: "rgba(168, 85, 247, 0.2)", info: "צלמו את האזור עם כרטיס אשראי או מטבע לייחוס ונועה תמדוד בשבילכם." },
                  { id: "consult" as TabId, icon: ShoppingCart, title: "ייעוץ מקצועי", desc: "המלצות על דגמים, בדיקת מכשירי חשמל והדרכה לפני קנייה. הידע של נועה לרשותכם.", color: "59, 130, 246", iconClass: "text-blue-400", borderColor: "rgba(59, 130, 246, 0.2)", info: "שאלו על דגמים, השוואות מחירים, בדיקת תקינות לפני קנייה, והמלצות מותגים." },
                ] as const).map((card) => (
                  <motion.button key={card.id} whileTap={{ scale: 0.97 }} onClick={() => enterTool(card.id)}
                    className="rounded-2xl p-5 text-right flex flex-col gap-3 min-h-[140px] relative"
                    style={{ background: "rgba(20, 20, 20, 0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${card.borderColor}` }}
                    data-testid={`card-${card.id}`}>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      if (infoTooltip === card.id) {
                        if (tooltipAudioRef.current) { tooltipAudioRef.current.pause(); tooltipAudioRef.current.currentTime = 0; tooltipAudioRef.current = null; }
                        setTooltipAudioPlaying(null);
                        setInfoTooltip(null);
                      } else {
                        if (tooltipAudioRef.current) { tooltipAudioRef.current.pause(); tooltipAudioRef.current.currentTime = 0; }
                        setInfoTooltip(card.id);
                        const audioMap: Record<TabId, string> = { repair: "/fix.mp3", acoustic: "/sound.mp3", measure: "/messure.mp3", consult: "/consult.mp3" };
                        try {
                          const audio = new Audio(audioMap[card.id]);
                          tooltipAudioRef.current = audio;
                          audio.onended = () => setTooltipAudioPlaying(null);
                          audio.play().then(() => setTooltipAudioPlaying(card.id)).catch(() => {});
                        } catch {}
                      }
                    }}
                      className="absolute top-2.5 left-2.5 w-6 h-6 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-sm"
                      data-testid={`info-${card.id}`}>
                      <Info className="w-3.5 h-3.5 text-white/50" />
                    </button>
                    <card.icon className={cn("w-7 h-7", card.iconClass)} />
                    <div>
                      <p className="text-sm font-black text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{card.title}</p>
                      <p className="text-[11px] text-white/60 mt-1 leading-snug">{card.desc}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
            <AnimatePresence>
              {infoTooltip && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-6"
                  onClick={() => {
                    if (tooltipAudioRef.current) { tooltipAudioRef.current.pause(); tooltipAudioRef.current.currentTime = 0; tooltipAudioRef.current = null; }
                    setTooltipAudioPlaying(null);
                    setInfoTooltip(null);
                  }} data-testid="info-tooltip-overlay">
                  <div className="absolute inset-0 bg-black/60" />
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    className="relative rounded-2xl p-5 max-w-xs text-center z-10"
                    style={{ background: "rgba(25, 25, 25, 0.9)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.1)" }}
                    onClick={(e) => e.stopPropagation()} data-testid="info-tooltip-card">
                    {(() => {
                      const tooltipData = ([
                        { id: "repair", info: "תפתחו מצלמה ישר על התקלה. אני אדריך אתכם צעד-צעד מה להבריג, אזהה איזה חלקים צריך, ואפילו אגיד לכם טווחי מחירים שלהם כדי שלא יעקצו אתכם.", audio: "/fix.mp3" },
                        { id: "acoustic", info: "המכשיר עושה רעש מלחיץ? פשוט תקליטו אותו. אני אקשיב למנוע, אזהה בדיוק איזה רכיב כושל שם, ואגיד לכם מה צריך להחליף כדי לסגור את הפינה.", audio: "/sound.mp3" },
                        { id: "measure", info: "שימו כרטיס אשראי או מטבע ליד החלק וצלמו. אני לא רק אמדוד הכל בול – תגידו לי מה בא לכם לעשות בחלל הזה, ואני גם אמליץ בדיוק מה יכול להיכנס שם פרפקט.", audio: "/messure.mp3" },
                        { id: "consult", info: "מתלבטים איזה דגם לקנות? רוצים להשוות מחירים, לקבל המלצות או לבדוק תקינות לפני שמשלמים? דברו אליי. כל הידע שלי פה כדי שתעשו את הקנייה הכי חכמה שיש.", audio: "/consult.mp3" },
                      ] as const).find(c => c.id === infoTooltip);
                      return tooltipData ? (
                        <>
                          <p className="text-sm text-neutral-200 leading-relaxed" dir="rtl">{tooltipData.info}</p>
                          <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                            if (tooltipAudioPlaying === infoTooltip && tooltipAudioRef.current) {
                              tooltipAudioRef.current.pause();
                              tooltipAudioRef.current.currentTime = 0;
                              setTooltipAudioPlaying(null);
                            } else {
                              if (tooltipAudioRef.current) { tooltipAudioRef.current.pause(); tooltipAudioRef.current.currentTime = 0; }
                              const audio = new Audio(tooltipData.audio);
                              tooltipAudioRef.current = audio;
                              audio.onended = () => setTooltipAudioPlaying(null);
                              audio.play().catch(() => {});
                              setTooltipAudioPlaying(infoTooltip);
                            }
                          }}
                            className={cn(
                              "mt-3 w-full py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all",
                              tooltipAudioPlaying === infoTooltip
                                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 animate-pulse"
                                : "bg-neutral-800/80 text-neutral-300 border border-neutral-700/50"
                            )}
                            data-testid="button-tooltip-audio">
                            <Volume2 className="w-4 h-4" />
                            {tooltipAudioPlaying === infoTooltip ? "נועה מדברת..." : "שמעו את נועה"}
                          </motion.button>
                        </>
                      ) : null;
                    })()}
                    <button onClick={() => {
                      if (tooltipAudioRef.current) { tooltipAudioRef.current.pause(); tooltipAudioRef.current.currentTime = 0; tooltipAudioRef.current = null; }
                      setTooltipAudioPlaying(null);
                      setInfoTooltip(null);
                    }} className="mt-3 text-xs text-emerald-400 font-bold" data-testid="button-close-tooltip">הבנתי</button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {currentView === "repair" && (
          <div className="absolute inset-0 flex flex-col bg-neutral-950" data-testid="tab-repair">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-800/50 h-12">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-neutral-400" onClick={() => setMenuOpen(true)} data-testid="button-menu-repair">
                  <Menu className="h-4 w-4" />
                </Button>
                <button onClick={goHome} className="flex items-center gap-1.5" data-testid="button-back-repair">
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400">חזור</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-black text-white">תיקון בלייב</h2>
              </div>
              <div className="flex items-center gap-1">
                {torchSupported && (
                  <Button variant="ghost" size="icon" className={cn("text-neutral-400", torchOn && "text-yellow-400")} onClick={toggleTorch} data-testid="button-torch">
                    <Flashlight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {cameraActive && currentView === "repair" ? (
              <div className="shrink-0 relative h-48 bg-black overflow-hidden">
                <VideoMirror stream={streamRef.current} className="w-full h-full object-cover" testId="video-camera-feed" />
              </div>
            ) : !cameraActive && currentView === "repair" && !manualCameraStarted ? (
              <div className="shrink-0 relative h-32 bg-neutral-900/90 flex flex-col items-center justify-center gap-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setManualCameraStarted(true); startCamera(); }}
                  className="px-5 py-2.5 rounded-2xl bg-emerald-600 text-white font-black text-sm shadow-lg shadow-emerald-900/40 flex items-center gap-2"
                  data-testid="button-start-camera">
                  <Camera className="w-4 h-4" />
                  הפעל מצלמה
                </motion.button>
                <p className="text-[10px] text-neutral-500">כוונו את המצלמה לתקלה ונועה תדריך אתכם</p>
              </div>
            ) : cameraError ? (
              <div className="shrink-0 relative h-32 bg-neutral-900/90 flex flex-col items-center justify-center gap-2 p-4">
                <FlashlightOff className="w-8 h-8 text-neutral-600" />
                <p className="text-xs text-neutral-400 text-center">{cameraError}</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="rounded-xl border-neutral-700 text-neutral-300 text-xs" onClick={startCamera} data-testid="button-retry-camera">נסה שוב</Button>
                  <Button variant="outline" className="rounded-xl border-neutral-700 text-neutral-300 text-xs" onClick={() => galleryInputRef.current?.click()} data-testid="button-fallback-gallery"><ImageIcon className="w-3 h-3 ml-1" />גלריה</Button>
                </div>
              </div>
            ) : null}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" data-testid="repair-messages">
              <AnimatePresence>
                {emptyStateVisible && messages.length === 0 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center justify-center py-16">
                    <div className="rounded-2xl p-6 max-w-xs text-center" style={{ background: "rgba(20, 20, 20, 0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px" }} data-testid="empty-state-repair">
                      <Wrench className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                      <h3 className="text-base font-black text-white mb-1" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>בואו נראה על מה אנחנו מסתכלים.</h3>
                      <p className="text-xs text-white/70" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>כוונו את המצלמה ישר לתקלה. אני אזהה את הטריקים של היצרן ואדריך אתכם צעד-צעד, בלי שתשברו שום פלסטיק בדרך.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={cn("rounded-xl p-3.5 max-w-[90%]", msg.role === "user" ? "bg-emerald-950/30 border border-emerald-800/30 mr-auto" : "bg-neutral-900 border border-neutral-800/50 ml-auto")}
                  data-testid={`chat-message-${msg.id}`}>
                  <div className="space-y-1.5">
                    {msg.text.split("\n").filter(l => l.trim()).map((line, i) => (
                      <p key={i} className={cn("text-sm leading-relaxed", msg.role === "user" ? "text-emerald-300" : "text-neutral-300")}>{line.trim()}</p>
                    ))}
                  </div>
                  {msg.role === "assistant" && (
                    <div className="mt-2 pt-2 border-t border-neutral-800/40">
                      <button className="flex items-center gap-1.5 text-[10px] text-neutral-500" onClick={() => copyChat(msg.id, msg.text)} data-testid={`button-copy-${msg.id}`}>
                        {copiedId === msg.id ? <><Check className="w-3 h-3 text-emerald-400" />הועתק</> : <><Copy className="w-3 h-3" />העתק</>}
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
              {isProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-neutral-900 border border-neutral-800/50 rounded-xl p-3.5 max-w-[90%] ml-auto">
                  <div className="flex items-center gap-2">
                    <video autoPlay muted loop playsInline className="w-8 h-8 rounded-md object-cover">
                      <source src="/logo-spin.mp4" type="video/mp4" />
                    </video>
                    <span className="text-xs text-neutral-500">מזהה...</span>
                  </div>
                </motion.div>
              )}
              {renderSoundwave()}
              {renderSubtitle()}
              <div ref={chatEndRef} />
            </div>
            <div className="shrink-0 px-3 py-1 border-t border-neutral-800/50 bg-neutral-950">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="outline" size="icon" className={cn("rounded-full border-neutral-700", cameraActive ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "text-neutral-400")}
                  onClick={() => { if (cameraActive) { stopCamera(); } else { setManualCameraStarted(true); startCamera(); } }}
                  data-testid="button-repair-camera-toggle">
                  <Camera className="w-4 h-4" />
                </Button>
                {cameraActive && (
                  <Button variant="outline" onClick={handleScan} disabled={isProcessing}
                    className="rounded-full border-emerald-600/30 text-emerald-400 text-xs font-bold px-4"
                    data-testid="button-scan">
                    <ScanLine className="w-4 h-4 ml-1" />צלם ואבחן
                  </Button>
                )}
                <Button variant="outline" size="icon" className="rounded-full border-neutral-700 text-neutral-400" onClick={() => galleryInputRef.current?.click()} data-testid="button-gallery-upload">
                  <ImageIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {renderChatInput("תאר את הבעיה...")}
          </div>
        )}

        {currentView === "consult" && (
          <div className="absolute inset-0 flex flex-col bg-neutral-950" data-testid="tab-consult">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-800/50 h-12">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-neutral-400" onClick={() => setMenuOpen(true)} data-testid="button-menu">
                  <Menu className="h-4 w-4" />
                </Button>
                <button onClick={goHome} className="flex items-center gap-1.5" data-testid="button-back-consult">
                  <ArrowRight className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-blue-400">חזור</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-black text-white">ייעוץ מקצועי</h2>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="text-neutral-400" onClick={() => setIsMuted(!isMuted)} data-testid="button-mute-toggle">
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {cameraActive && currentView === "consult" ? (
              <div className="shrink-0 relative h-32 bg-black overflow-hidden">
                <VideoMirror stream={streamRef.current} className="w-full h-full object-cover" testId="video-consult-feed" />
              </div>
            ) : !cameraActive && currentView === "consult" && !manualCameraStarted ? (
              <div className="shrink-0 relative h-32 bg-neutral-900/90 flex flex-col items-center justify-center gap-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setManualCameraStarted(true); startCamera(); }}
                  className="px-5 py-2.5 rounded-2xl bg-blue-600 text-white font-black text-sm shadow-lg shadow-blue-900/40 flex items-center gap-2"
                  data-testid="button-start-camera-consult">
                  <Camera className="w-4 h-4" />
                  הפעל מצלמה
                </motion.button>
                <p className="text-[10px] text-neutral-500">צלמו מוצר לייעוץ מיידי</p>
              </div>
            ) : null}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" data-testid="chat-messages">
              <AnimatePresence>
                {emptyStateVisible && messages.length === 0 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center justify-center py-16">
                    <div className="rounded-2xl p-6 max-w-xs text-center" style={{ background: "rgba(20, 20, 20, 0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px" }} data-testid="empty-state-consult">
                      <ShoppingCart className="w-8 h-8 text-blue-400 mx-auto mb-3" />
                      <h3 className="text-base font-black text-white mb-1" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>ייעוץ מקצועי</h3>
                      <p className="text-xs text-white/70" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>המלצות על דגמים, בדיקת מכשירי חשמל והדרכה לפני קנייה. הידע של נועה לרשותכם.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={cn("rounded-xl p-3.5 max-w-[90%]", msg.role === "user" ? "bg-emerald-950/30 border border-emerald-800/30 mr-auto" : "bg-neutral-900 border border-neutral-800/50 ml-auto")}
                  data-testid={`chat-message-${msg.id}`}>
                  <div className="space-y-1.5">
                    {msg.text.split("\n").filter(l => l.trim()).map((line, i) => (
                      <p key={i} className={cn("text-sm leading-relaxed", msg.role === "user" ? "text-emerald-300" : "text-neutral-300")}>{line.trim()}</p>
                    ))}
                  </div>
                  {msg.role === "assistant" && (
                    <div className="mt-2 pt-2 border-t border-neutral-800/40">
                      <button className="flex items-center gap-1.5 text-[10px] text-neutral-500" onClick={() => copyChat(msg.id, msg.text)} data-testid={`button-copy-${msg.id}`}>
                        {copiedId === msg.id ? <><Check className="w-3 h-3 text-emerald-400" />הועתק</> : <><Copy className="w-3 h-3" />העתק</>}
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
              {isProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-neutral-900 border border-neutral-800/50 rounded-xl p-3.5 max-w-[90%] ml-auto">
                  <div className="flex items-center gap-2">
                    <video autoPlay muted loop playsInline className="w-8 h-8 rounded-md object-cover">
                      <source src="/logo-spin.mp4" type="video/mp4" />
                    </video>
                    <span className="text-xs text-neutral-500">בודק...</span>
                  </div>
                </motion.div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="shrink-0 px-3 py-1 border-t border-neutral-800/50 bg-neutral-950">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="outline" size="icon" className={cn("rounded-full border-neutral-700", cameraActive ? "bg-blue-600/20 text-blue-400 border-blue-600/30" : "text-neutral-400")}
                  onClick={() => { if (cameraActive) { stopCamera(); } else { setManualCameraStarted(true); startCamera(); } }}
                  data-testid="button-consult-camera">
                  <Camera className="w-4 h-4" />
                </Button>
                {cameraActive && torchSupported && (
                  <Button variant="ghost" size="icon" className={cn("rounded-full", torchOn ? "bg-yellow-500/80 text-black" : "text-neutral-400")} onClick={toggleTorch} data-testid="button-torch-consult">
                    <Flashlight className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="outline" size="icon" className="rounded-full border-neutral-700 text-neutral-400" onClick={() => galleryInputRef.current?.click()} data-testid="button-consult-gallery">
                  <ImageIcon className="w-4 h-4" />
                </Button>
                {cameraActive && (
                  <Button variant="outline" onClick={handleScan} disabled={isProcessing}
                    className="rounded-full border-blue-600/30 text-blue-400 text-xs font-bold px-4"
                    data-testid="button-consult-scan">
                    <ScanLine className="w-4 h-4 ml-1" />צלם
                  </Button>
                )}
              </div>
            </div>
            {renderChatInput("שאלו על דגמים, המלצות או תקינות...")}
          </div>
        )}

        {currentView === "acoustic" && (
          <div className="absolute inset-0 flex flex-col bg-black" data-testid="tab-acoustic">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-800/50 h-12">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-neutral-400" onClick={() => setMenuOpen(true)} data-testid="button-menu-acoustic">
                  <Menu className="h-4 w-4" />
                </Button>
                <button onClick={goHome} className="flex items-center gap-1.5" data-testid="button-back-acoustic">
                  <ArrowRight className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-bold text-red-400">חזור</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <AudioLines className="w-4 h-4 text-red-400" />
                <h2 className="text-sm font-black text-white">זיהוי רעשים</h2>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="text-neutral-400" onClick={() => setIsMuted(!isMuted)} data-testid="button-mute-toggle-acoustic">
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {cameraActive && currentView === "acoustic" ? (
              <div className="shrink-0 relative h-32 bg-black overflow-hidden border-b border-neutral-800/50">
                <VideoMirror stream={streamRef.current} className="w-full h-full object-cover" testId="video-acoustic-feed" />
              </div>
            ) : !cameraActive && currentView === "acoustic" && !manualCameraStarted ? (
              <div className="shrink-0 relative h-24 bg-neutral-900/90 flex flex-col items-center justify-center gap-1.5">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setManualCameraStarted(true); startCamera(); }}
                  className="px-5 py-2 rounded-2xl bg-red-600 text-white font-black text-sm shadow-lg shadow-red-900/40 flex items-center gap-2"
                  data-testid="button-start-camera-acoustic">
                  <Camera className="w-4 h-4" />
                  הפעל מצלמה
                </motion.button>
                <p className="text-[10px] text-neutral-500">צלמו את המכשיר אחרי ניתוח הרעש</p>
              </div>
            ) : null}
            <div className={cn("flex-1 flex flex-col items-center justify-center relative px-6", cameraActive && "justify-start pt-4")}>
              <AnimatePresence>
                {emptyStateVisible && messages.length === 0 && !isRecordingAudio && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="absolute top-8 left-6 right-6">
                    <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(20, 20, 20, 0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px" }} data-testid="empty-state-acoustic">
                      <AudioLines className="w-8 h-8 text-red-400 mx-auto mb-3" />
                      <h3 className="text-base font-black text-white mb-1" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>המנוע מזייף? תנו לי להקשיב.</h3>
                      <p className="text-xs text-white/70" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>עושה רעש של טרקטור? שימו את הטלפון קרוב למכשיר, קליק על הכפתור האדום ואגיד לכם בדיוק מה נדפק (ואיך מסדרים את זה).</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {isRecordingAudio && (
                <div className="mb-8">
                  <div className="flex items-center gap-1 justify-center">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <motion.div key={i} className="w-1 bg-red-500 rounded-full"
                        animate={{ height: [8, Math.random() * 40 + 8, 8] }}
                        transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.05 }} />
                    ))}
                  </div>
                  <p className="text-sm text-red-300 font-bold text-center mt-4">מקליט... {audioRecordingTime}s / {MAX_RECORD_SECONDS}s</p>
                </div>
              )}

              <div className="relative">
                {isRecordingAudio && (
                  <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)]" viewBox="0 0 112 112">
                    <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                    <circle cx="56" cy="56" r="48" fill="none" stroke="#ef4444" strokeWidth="3"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - recordProgress)}
                      strokeLinecap="round"
                      transform="rotate(-90 56 56)"
                      className="transition-all duration-1000 ease-linear"
                      data-testid="record-progress-ring" />
                  </svg>
                )}
                <motion.button whileTap={{ scale: 0.95 }} onClick={toggleAudioRecording} disabled={isProcessing}
                  className={cn("w-28 h-28 rounded-full flex items-center justify-center transition-all",
                    isRecordingAudio ? "bg-red-600 shadow-[0_0_60px_rgba(239,68,68,0.5)] animate-pulse"
                    : isProcessing ? "bg-neutral-800" : "bg-red-700/80 shadow-[0_0_40px_rgba(239,68,68,0.3)]")}
                  data-testid="button-record-audio">
                  <AudioLines className={cn("w-12 h-12", isRecordingAudio || !isProcessing ? "text-white" : "text-neutral-600")} />
                </motion.button>
              </div>
              <p className="text-sm text-neutral-500 mt-4 font-bold">
                {isRecordingAudio ? "לחץ שוב לעצירה" : isProcessing ? "מנתח את הרעש..." : "יאללה, להקליט"}
              </p>

              {latestSubtitle && !isRecordingAudio && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-24 left-4 right-4">
                  <div className="bg-neutral-900/80 backdrop-blur-sm rounded-xl p-4 border border-neutral-700/30">
                    {latestSubtitle.split("\n").filter(l => l.trim()).map((line, i) => (
                      <p key={i} className="text-sm font-bold text-white leading-relaxed text-center">{line.trim()}</p>
                    ))}
                    <div className="mt-2 flex justify-center">
                      <button className="flex items-center gap-1.5 text-[10px] text-neutral-500" data-testid="button-copy-acoustic"
                        onClick={() => { const last = messages.filter(m => m.role === "assistant").pop(); if (last) copyChat(last.id, last.text); }}>
                        <Copy className="w-3 h-3" />העתק
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            <div className="shrink-0 px-3 py-2 border-t border-neutral-800/50 bg-black">
              <div className="flex items-center gap-1.5 mb-1.5" dir="rtl">
                <Button variant="outline" size="icon" className={cn("rounded-full border-neutral-700", cameraActive ? "bg-red-600/20 text-red-400 border-red-600/30" : "text-neutral-400")}
                  onClick={() => { if (cameraActive) { stopCamera(); } else { setManualCameraStarted(true); startCamera(); } }}
                  data-testid="button-acoustic-camera-toggle">
                  <Camera className="w-4 h-4" />
                </Button>
                {cameraActive && (
                  <Button variant="outline" onClick={handleScan} disabled={isProcessing}
                    className="rounded-full border-red-600/30 text-red-400 text-xs font-bold px-4"
                    data-testid="button-acoustic-scan">
                    <ScanLine className="w-4 h-4 ml-1" />צלם ואבחן
                  </Button>
                )}
                <Button variant="outline" size="icon" className="rounded-full border-neutral-700 text-neutral-400" onClick={() => galleryInputRef.current?.click()} data-testid="button-acoustic-gallery">
                  <ImageIcon className="w-4 h-4" />
                </Button>
                {torchSupported && cameraActive && (
                  <Button variant="ghost" size="icon" className={cn("rounded-full text-neutral-400", torchOn && "text-yellow-400")} onClick={toggleTorch} data-testid="button-torch-acoustic">
                    <Flashlight className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2" dir="rtl">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="flex-1 min-h-[40px] max-h-[60px] rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder:text-neutral-600 px-3.5 py-2.5 text-sm leading-relaxed focus:outline-none focus:border-emerald-700/60 resize-none transition-colors"
                  placeholder="כתוב הודעה..."
                  disabled={isProcessing}
                  data-testid="input-acoustic-message"
                />
                <Button size="icon" onClick={toggleVoiceInput} disabled={isProcessing}
                  className={cn("rounded-xl shrink-0", isListening ? "bg-red-600 text-white animate-pulse" : "bg-neutral-800 text-neutral-400")}
                  data-testid="button-acoustic-mic">
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
                <Button size="icon" onClick={handleSend} disabled={!input.trim() || isProcessing}
                  className={cn("rounded-xl shrink-0", input.trim() && !isProcessing ? "bg-emerald-600 text-white" : "bg-neutral-800 text-neutral-600")}
                  data-testid="button-acoustic-send">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {currentView === "measure" && (
          <div className="absolute inset-0 flex flex-col bg-neutral-950" data-testid="tab-measure">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-800/50 h-12">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-neutral-400" onClick={() => setMenuOpen(true)} data-testid="button-menu-measure">
                  <Menu className="h-4 w-4" />
                </Button>
                <button onClick={goHome} className="flex items-center gap-1.5" data-testid="button-back-measure">
                  <ArrowRight className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-purple-400">חזור</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-black text-white">מדידה חכמה</h2>
              </div>
              <div className="flex items-center gap-1">
                {torchSupported && (
                  <Button variant="ghost" size="icon" className={cn("text-neutral-400", torchOn && "text-yellow-400")} onClick={toggleTorch} data-testid="button-torch-measure">
                    <Flashlight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {cameraActive && currentView === "measure" ? (
              <div className="shrink-0 relative h-48 bg-black overflow-hidden">
                <VideoMirror stream={streamRef.current} className="w-full h-full object-cover" testId="video-measure-feed" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Crosshair className="w-16 h-16 text-purple-400/50" strokeWidth={1} data-testid="crosshair-overlay" />
                </div>
              </div>
            ) : !cameraActive && currentView === "measure" && !manualCameraStarted ? (
              <div className="shrink-0 relative h-32 bg-neutral-900/90 flex flex-col items-center justify-center gap-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setManualCameraStarted(true); startCamera(); }}
                  className="px-5 py-2.5 rounded-2xl bg-purple-600 text-white font-black text-sm shadow-lg shadow-purple-900/40 flex items-center gap-2"
                  data-testid="button-start-camera-measure">
                  <Camera className="w-4 h-4" />
                  הפעל מצלמה
                </motion.button>
                <p className="text-[10px] text-neutral-500">צלמו את האזור עם כרטיס אשראי לייחוס</p>
              </div>
            ) : cameraError ? (
              <div className="shrink-0 relative h-32 bg-neutral-900/90 flex flex-col items-center justify-center gap-2 p-4">
                <FlashlightOff className="w-8 h-8 text-neutral-600" />
                <p className="text-xs text-neutral-400 text-center">{cameraError}</p>
                <Button variant="outline" className="rounded-xl border-neutral-700 text-neutral-300 text-xs" onClick={startCamera} data-testid="button-retry-camera-measure">נסה שוב</Button>
              </div>
            ) : null}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" data-testid="measure-messages">
              <AnimatePresence>
                {emptyStateVisible && messages.length === 0 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center justify-center py-16">
                    <div className="rounded-2xl p-6 max-w-xs text-center" style={{ background: "rgba(20, 20, 20, 0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px" }} data-testid="empty-state-measure">
                      <Ruler className="w-8 h-8 text-purple-400 mx-auto mb-3" />
                      <h3 className="text-base font-black text-white mb-1" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>עזבו את הסרט מידה, אני על זה.</h3>
                      <p className="text-xs text-white/70" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>צריכים לדעת מה הגודל של החלק? תעבירו את המצלמה לאט מצד לצד, ואני אתן לכם מידות בול, בלי לצאת פראיירים בחנות חלפים.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={cn("rounded-xl p-3.5 max-w-[90%]", msg.role === "user" ? "bg-purple-950/30 border border-purple-800/30 mr-auto" : "bg-neutral-900 border border-neutral-800/50 ml-auto")}
                  data-testid={`chat-message-${msg.id}`}>
                  <div className="space-y-1.5">
                    {msg.text.split("\n").filter(l => l.trim()).map((line, i) => (
                      <p key={i} className={cn("text-sm leading-relaxed", msg.role === "user" ? "text-purple-300" : "text-neutral-300")}>{line.trim()}</p>
                    ))}
                  </div>
                  {msg.role === "assistant" && (
                    <div className="mt-2 pt-2 border-t border-neutral-800/40">
                      <button className="flex items-center gap-1.5 text-[10px] text-neutral-500" onClick={() => copyChat(msg.id, msg.text)} data-testid={`button-copy-${msg.id}`}>
                        {copiedId === msg.id ? <><Check className="w-3 h-3 text-purple-400" />הועתק</> : <><Copy className="w-3 h-3" />העתק</>}
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
              {isProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-neutral-900 border border-neutral-800/50 rounded-xl p-3.5 max-w-[90%] ml-auto">
                  <div className="flex items-center gap-2">
                    <video autoPlay muted loop playsInline className="w-8 h-8 rounded-md object-cover">
                      <source src="/logo-spin.mp4" type="video/mp4" />
                    </video>
                    <span className="text-xs text-neutral-500">מודד...</span>
                  </div>
                </motion.div>
              )}
              {renderSoundwave()}
              {renderSubtitle()}
              <div ref={chatEndRef} />
            </div>
            <div className="shrink-0 px-3 py-1 border-t border-neutral-800/50 bg-neutral-950">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="outline" size="icon" className={cn("rounded-full border-neutral-700", cameraActive ? "bg-purple-600/20 text-purple-400 border-purple-600/30" : "text-neutral-400")}
                  onClick={() => { if (cameraActive) { stopCamera(); } else { setManualCameraStarted(true); startCamera(); } }}
                  data-testid="button-measure-camera-toggle">
                  <Camera className="w-4 h-4" />
                </Button>
                {cameraActive && (
                  <Button variant="outline" onClick={handleScan} disabled={isProcessing}
                    className="rounded-full border-purple-600/30 text-purple-400 text-xs font-bold px-4"
                    data-testid="button-measure-scan">
                    <Ruler className="w-4 h-4 ml-1" />צלם ומדוד
                  </Button>
                )}
                <Button variant="outline" size="icon" className="rounded-full border-neutral-700 text-neutral-400" onClick={() => galleryInputRef.current?.click()} data-testid="button-measure-gallery">
                  <ImageIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {renderChatInput("מה למדוד?")}
          </div>
        )}
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}

function VideoMirror({ stream, className, testId }: { stream: MediaStream | null; className?: string; testId?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={className} data-testid={testId} />;
}
