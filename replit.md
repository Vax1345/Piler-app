# (PLIER)"פלאייר"

## Overview

PLIER is a mobile-first Hebrew-language real-time DIY repair instructor. It uses a live camera feed (WebRTC) with computer vision (Gemini) to guide users step-by-step through home repairs. The AI persona is sharp, fast, gender-neutral but highly professional - the app itself speaks as the expert. Speaks in short, punchy Hebrew slang (2-3 sentences max), gives ONE step at a time, demands visual verification before destructive actions, and provides pricing with technician cost comparisons. Single-user focused with localStorage-based session history.

## Recent Changes (Feb 2026)
- CRITICAL PRODUCT OVERHAUL: Category accent colors (green=repair, red=acoustic, purple=measure, blue=consult)
- INFO TOOLTIPS: "?" icon on each dashboard card with explanation modal
- LOGO BRANDING: Splash uses logo-spin.mp4 (autoplay/muted/loop), dashboard uses logo.jpg
- INFO TOOLTIP AUDIO: Each tooltip has play button (fix.mp3, sound.mp3, messure.mp3, consult.mp3)
- THINKING STATE: Processing indicator shows small logo-spin.mp4 spinner
- SPEAKING STATE: CSS soundwave equalizer (12 animated bars) at bottom when isSpeaking=true
- CAMERA MODAL AUTOPLAY: Attempts audio autoplay, toggles "השתק"/"לחצו לשמוע", lock icon warning for denied state
- CONSULT REBRANDED: "ייעוץ מקצועי" title, camera/torch/gallery support in consult screen
- BACK BUTTON: Prominent "חזור" with ArrowRight icon on all tool screens, browser history pushState
- HAMBURGER MENU ACCORDION: History hidden by default, expand/collapse on click
- CAMERA NO AUTO-START: "הפעל מצלמה" button required to activate camera in repair/measure
- CAMERA IN CONSULT: Toggle camera, gallery upload, torch, and scan in consult view
- TORCH DUPLICATED: Available on repair, measure, and consult screens
- PERMISSION MODAL FIX: e.stopPropagation() on action buttons prevents audio replay
- SYSTEM PROMPT OVERHAUL: Removed hardcoded templates ("בואו נסדר את זה" / "תגיד לי כשסיימת"), natural Noa persona
- SMART MEASUREMENT: Carpenter/designer mode for space feasibility questions
- ISRAELI STORES ONLY: ACE, הום סנטר, Max Stock (never Home Depot/Lowe's)
- PERSONA SCRUB: Removed "Avi" (אבי) persona, replaced with Noa professional voice
- FROSTED GLASS UI: Empty state cards use glassmorphism effect (rgba(20,20,20,0.4) + backdrop-blur(12px) + accent-colored borders)
- Anti-verbosity protocol: Max 2-3 short punchy sentences per response, Hebrew slang (תכל'ס, שמע, יאללה)
- UX Psychology: One-step-at-a-time pacing, visual verification before destructive actions, confidence calibration with probabilities
- Sales pitch: Technician cost comparison ("טכנאי ייקח 500 שקל, החלק עולה 200")
- High-ticket focus: Actively diagnoses expensive parts (control boards, drum bearings, spider arms, HVAC)
- Israeli store sourcing: ACE, הום סנטר, Max Stock, טמבוריות. AliExpress/eBay for specific parts
- Hardware Hacking (Right-to-Repair): Active detection of glued casings (heat gun bypass), security screws (Torx/Pentalobe/Triangle with exact bit sizes), diagnostic opacity (Black Box → acoustic diagnostics redirect)
- RAW AUDIO CAPTURE: getUserMedia with noiseSuppression/echoCancellation/autoGainControl all disabled for accurate mechanical sound analysis
- UNIFIED ACOUSTIC INPUT: Camera toggle, gallery upload, and scan buttons added to acoustic view toolbar - users can take pictures immediately after audio analysis without leaving the screen
- Acoustic diagnostics: "הקלט רעש" button using MediaRecorder (5-10 sec audio clips sent to Gemini), proactive redirect for devices without screens/error codes
- HISTORY FIX: Unified localStorage key to "PLIER_history" (was split across 3 different keys causing data loss), with automatic migration from old keys
- Viral share ask: WhatsApp share prompt after successful repairs with savings calculation
- Audio base64 support in schema (audioBase64 field in chatRequestSchema)
- Brand recommendations: Premium vs Value options (Bosch/Makita/Grohe vs Stanley/Topkick)
- Innovation-first: WAGO connectors, smart switches (Shelly/Sonoff), modern sealants
- Procurement section: Parts list with ILS prices and search queries
- Creative consultant: Paint/design advice with Tambour/Nirlat brand names
- Spatial measurement: Credit card / 10 NIS coin reference for dimension estimation
- Fixed "sticky image" bug: text-only follow-ups no longer resend previous images
- localStorage safety: base64 images stripped before saving
- Live camera feed via WebRTC (getUserMedia, rear camera)
- ARCHITECTURE OVERHAUL: Welcome Screen → Home Dashboard → Tool View flow (no bottom tabs)
- Welcome screen: always-on (no localStorage skip), "Noa" AI persona intro, primary + skip buttons
- Home Dashboard: 4 glassmorphism tool cards in 2x2 grid (repair, acoustic, measure, consult), camera/mic OFF
- Tool activation: Camera/mic only start when entering repair/measure tool, stopped on return to dashboard
- Back-to-home: X button in every tool header calls goHome() which stops all media streams
- Hamburger menu: Navigation drawer with מסך ראשי, היסטוריית תיקונים, הגדרות, אודות + history list
- State: showWelcome (always true on load), currentView ("dashboard" | "repair" | "consult" | "acoustic" | "measure")
- Shared camera via VideoMirror component: persistent stream across repair/measure tools
- Voice input with auto-submit on speech end
- Torch toggle, gallery upload fallback, copy button on AI messages
- Backend: isPLIER mode detected by `[קטגוריה:` prefix, routes to Gemini with chat history
- COST PROTECTION: 15-second walkie-talkie mic limit with SVG countdown ring, auto-stop
- COST PROTECTION: Backend maxOutputTokens reduced to 150, graceful TEXT-only fallback on quota/timeout errors
- NATIVE AUDIO TTS: Three-tier fallback: (1) ElevenLabs v3 (eleven_v3 model) PRIMARY via ELEVENLABS_API_KEY secret or Replit connector, (2) Gemini TTS via gemini-2.5-flash-preview-tts with Puck voice as fallback, (3) Browser TTS speakWithBestVoice as final fallback
- TTS MODULE: server/lib/elevenlabsTTS.ts - generateSpeech() returns {buffer, format} or null, audioBase64 sent in SSE turn events. Uses ElevenLabs SDK (elevenlabs npm package) with streaming convert API
- COST PROTECTION: Browser TTS backup (speakWithBestVoice) - Hebrew male voice, pitch 0.8, chunked speech when no backend audio
- PWA: manifest.json, service-worker.js with stale-while-revalidate caching, installable to home screen
- MULTI-USER: sessionId (UUID v4) generated per browser via localStorage, sent with every API request
- SESSION ISOLATION: In-memory Map in sessionManager.ts with 30min TTL, max 500 sessions, auto-cleanup
- TELEMETRY: Async append-only telemetry.json logging with queue-based writes, includes sessionId per event

## User Preferences

- Communication in Hebrew only for AI responses, Hebrew slang encouraged
- No Markdown formatting in AI output - clean text only
- Dark, premium aesthetic
- Never tell user to "call a professional" unless live mains electricity, gas lines, or structural demolition
- App persona: direct, punchy, brand-aware, innovation-forward, reassuring, gender-neutral
- One step at a time - never dump 5-step lists
- Visual verification before destructive/risky actions
- Spatial awareness: direct user physically via camera
- Stop tokens enforce output boundaries

## System Architecture

### UI/UX Decisions
The platform features a static viewport UI with no scrolling, centered speaker icons, and a dynamic caption overlay. A "Stories bar" at the top displays expert circles with LIVE indicators. The main stage shows a large expert icon and name, entering STANDBY mode when idle. Captions are fixed-position, word-by-word text reveals synced with audio. A toggleable transcript panel provides a full conversation history with color-coded expert blocks. The aesthetic is gold on black, with full RTL (Right-to-Left) Hebrew UI support.

### Technical Implementations
- **Frontend:** React 18 with TypeScript, Vite, Tailwind CSS (with shadcn/ui), Wouter for routing, and Framer Motion for animations.
- **Backend:** Node.js with Express, TypeScript (ES Modules), REST endpoints with Zod validation.
- **AI Pipeline:**
    - **Multi-Agent System:** Five expert personas (Ontological Engineer, Renaissance Man, Crisis Manager, Aristotle/Strategic Mentor 2026, Operational Fox) orchestrated by "המנצח" (The Conductor) in selective dialogue.
    - **Safety-First Architecture:** A `safetyScan()` function runs before routing, forcing [crisis, operational] experts on risk keywords.
    - **Conductor Protocol (המנצח):** Orchestrates expert order: ontological → renaissance → crisis → aristotle → operational. Aristotle synthesizes all expert insights and connects them to 2026 trends. The Crisis Manager acts as a "Go/No-Go" gate.
    - **Context Scout (Pre-processor):** Fetches real-time market trends using Gemini Google Search grounding for inputs under 15 words or containing business keywords. Its output is injected as Immutable Facts, preventing expert web searches. Uses `responseSchema` for reliable JSON output with retry logic.
    - **Scout Logs (Intelligence Cache):** In-memory FIFO cache (5 entries) in `server/lib/scoutLogs.ts`. Before live Scout search, checks cache with cosine similarity > 0.85 AND 10-minute TTL. Cache hits bypass Google Search grounding entirely. GET `/api/scout-logs` exposes recent intelligence to frontend. Knowledge Panel displays "מודיעין עדכני" section with cached indicator.
    - **Project Ledger (Immutable):** Static system message injected at the top of every LLM call: `[Project Ledger | Status: Ice Cream Project | Inventory: 500g Agar-Agar, 2kg Xanthan Gum | Safety: Microbial Protein Veto by Crisis Manager]`. Immune to context window management, summarization, or truncation.
    - **Pre-Streaming Sync Lock:** Mandatory 500ms delay between agent turns on the server side. Each turn is sent as an individual SSE `turn` event. Ensures previous agent output is fully stored and next agent validates against the Ledger before streaming.
    - **Context Management:** `user_core_profile`, `living_prompt_summary` (frozen - no auto-updates), and top 3 RAG memories. Auto-summary disabled to preserve technical constants (e.g., "1000 RPM", "stabilizers at 2%") as high-priority tokens.
    - **RAG Memory Engine:** Uses TF-IDF vectorization with cosine similarity for retrieval (threshold 0.7, topK=3) from a PostgreSQL `memories` table.
    - **Hard-Facts Injection:** Verified inventory from `acquired_items` table, hallucination kill mechanisms, and Ledger-based veto enforcement (microbial protein blocked for all experts except Crisis Manager).
    - **Straitjacket Protocol:** Bans meta-talk, enforces silent constraints, and prioritizes system instructions to prevent prompt injection and sycophancy.
    - **Internal Monologue:** Hidden first-principles analysis (3 sentences) precedes expert response generation.
    - **strategic Shield (Context Refresh):** Cosine similarity < 0.4 between input and living summary triggers a context reset.
    - **Stop Token Control:** Each expert has a strict stop token enforcing output boundaries (e.g., `[ONTOLOGY_END]`).
    - **Summary Mode:** Activates when more than 3 experts are selected, limiting each response to 100 tokens.
    - **File Upload:** Chunked text upload (800 chars) with automatic vectorization to episodic memory.
    - **Long-term memory:** Across conversations, with conversation history sidebar and full backup/export to JSON.
- **Data Storage:** PostgreSQL with Drizzle ORM, storing `conversations`, `memory_contexts`, `memories`, and `user_profiles`. User core profiles are encrypted with AES-256-GCM.

### Feature Specifications
- **Queue Engine:** Ensures sequential turns with audio prefetching.
- **Knowledge Panel:** Toggleable overlay showing user memory map, profile, and expert categories.
- **API Endpoints:** Comprehensive set of REST endpoints for chat, conversation management, user profile, memory management, file upload, TTS, and video generation. Includes real-time SSE for chat responses.

## External Dependencies

### AI Services
- **Google Gemini API:** Primary AI model for chat responses (via Replit AI Integrations).
- **ElevenLabs:** Fallback text-to-speech service (via Replit Connector).
- **HeyGen API v2:** Video avatar generation with lip-synced speech, used for expert video profiles.

### Database
- **PostgreSQL:** Used for persistent storage, accessed via `DATABASE_URL` environment variable.
- **Drizzle ORM:** Used for database interaction with node-postgres driver.

### Key NPM Packages
- `@google/genai`: Google Gemini SDK.
- `@elevenlabs/elevenlabs-js`: ElevenLabs TTS SDK.
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations.
- `framer-motion`: Animation library.
- `zod`: Runtime type validation.
- `wouter`: Client-side routing.
- `multer`: File upload middleware.

### Required Secrets
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `AI_INTEGRATIONS_GEMINI_BASE_URL`
- `HEYGEN_API_KEY`
- ElevenLabs API key (managed via Replit Connector)