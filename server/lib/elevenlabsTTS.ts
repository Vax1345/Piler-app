// TTS generation - ElevenLabs v3 primary, browser TTS fallback
// Uses Replit ElevenLabs connector or ELEVENLABS_API_KEY secret

async function getElevenLabsApiKey(): Promise<string | null> {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? 'repl ' + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

    if (!xReplitToken || !hostname) return null;

    const connRes = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=elevenlabs`,
      { headers: { Accept: 'application/json', X_REPLIT_TOKEN: xReplitToken } }
    );
    const connData = await connRes.json();
    return connData.items?.[0]?.settings?.api_key || null;
  } catch {
    return null;
  }
}

export async function generateSpeech(text: string): Promise<{ buffer: Buffer; format: "wav" | "mp3" } | null> {
  const elevenResult = await tryElevenLabsV3(text);
  if (elevenResult) return elevenResult;

  const geminiResult = await tryGeminiTTS(text);
  if (geminiResult) return geminiResult;

  return null;
}

const VOICE_ID = "5l5f8iK3YPeGga21rQIX";

async function tryElevenLabsV3(text: string): Promise<{ buffer: Buffer; format: "mp3" } | null> {
  try {
    const apiKey = await getElevenLabsApiKey();
    if (!apiKey) {
      console.log("[TTS ElevenLabs] No API key available");
      return null;
    }
    console.log(`[TTS ElevenLabs v3] Generating audio for ${text.length} chars`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_v3",
          voice_settings: {
            stability: 0.0,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[TTS ElevenLabs v3] HTTP ${response.status}: ${errorBody}`);
      return null;
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length < 100) {
      console.warn("[TTS ElevenLabs v3] Audio too small, likely empty");
      return null;
    }

    console.log(`[TTS ElevenLabs v3] Audio generated (${(buffer.length / 1024).toFixed(1)}KB MP3)`);
    return { buffer, format: "mp3" };
  } catch (err: any) {
    console.error(`[TTS ElevenLabs v3] Failed: ${err?.message || err}`);
    return null;
  }
}

async function tryGeminiTTS(text: string): Promise<{ buffer: Buffer; format: "wav" } | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      console.log("[TTS Gemini] No API key available, skipping");
      return null;
    }

    const { GoogleGenAI } = await import("@google/genai");
    const savedGoogleKey = process.env.GOOGLE_API_KEY;
    if (savedGoogleKey) delete process.env.GOOGLE_API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    if (savedGoogleKey) process.env.GOOGLE_API_KEY = savedGoogleKey;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say in Hebrew, natural male voice, calm and direct tone: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Puck" },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.[0];
    if (!audioPart?.inlineData?.data) {
      console.warn("[TTS Gemini] No audio data in response");
      return null;
    }

    const mimeType = audioPart.inlineData.mimeType || "audio/L16;rate=24000";

    if (mimeType.includes("wav") || mimeType.includes("mp3") || mimeType.includes("mpeg")) {
      const buffer = Buffer.from(audioPart.inlineData.data, "base64");
      console.log(`[TTS Gemini] Pre-encoded audio (${(buffer.length / 1024).toFixed(1)}KB)`);
      return { buffer, format: "wav" };
    }

    const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    const wavHeader = Buffer.alloc(44);
    wavHeader.write("RIFF", 0);
    wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
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
    wavHeader.writeUInt32LE(pcmBuffer.length, 40);

    const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
    console.log(`[TTS Gemini] Native audio generated (${(wavBuffer.length / 1024).toFixed(1)}KB WAV)`);
    return { buffer: wavBuffer, format: "wav" };
  } catch (err: any) {
    console.error(`[TTS Gemini] Failed: ${err?.message || err}`);
    return null;
  }
}
