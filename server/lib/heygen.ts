import crypto from "crypto";

const HEYGEN_BASE_URL = "https://api.heygen.com";

export type HeyGenCharacterProfile = {
  avatarId?: string;
  templateId?: string;
  voiceName: string;
  pitch: number;
  speakingRate: number;
  useAvatarIV: boolean;
};

export const HEYGEN_CHARACTER_PROFILES: Record<string, HeyGenCharacterProfile> = {
  ontological: {
    avatarId: "Adrian_public_2_20240312",
    voiceName: "Charon",
    pitch: -2.0,
    speakingRate: 0.9,
    useAvatarIV: true,
  },
  renaissance: {
    avatarId: "Tyler_public_1",
    voiceName: "Puck",
    pitch: 1.0,
    speakingRate: 1.1,
    useAvatarIV: true,
  },
  crisis: {
    avatarId: "Aditya_public_4",
    voiceName: "Orus",
    pitch: -4.0,
    speakingRate: 0.85,
    useAvatarIV: true,
  },
  operational: {
    avatarId: "Tyler_public_1",
    voiceName: "Fenrir",
    pitch: -1.0,
    speakingRate: 1.15,
    useAvatarIV: true,
  },
};

export type VideoJob = {
  id: string;
  conversationId: number;
  role: string;
  sentenceIndex: number;
  text: string;
  heygenVideoId: string | null;
  status: "generating_audio" | "uploading" | "rendering" | "completed" | "failed" | "approved";
  videoUrl: string | null;
  audioId: string | null;
  error: string | null;
  createdAt: string;
};

const videoJobs = new Map<string, VideoJob>();
const audioStore = new Map<string, Buffer>();

const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const STUCK_JOB_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of Array.from(videoJobs.entries())) {
    const age = now - new Date(job.createdAt).getTime();
    if (age > JOB_TTL_MS && (job.status === "approved" || job.status === "failed" || job.status === "completed")) {
      videoJobs.delete(id);
    }
    if (age > STUCK_JOB_TTL_MS && (job.status === "rendering" || job.status === "uploading" || job.status === "generating_audio")) {
      job.status = "failed";
      job.error = "Job timed out after 30 minutes";
    }
  }
}, CLEANUP_INTERVAL_MS);

export function storeAudio(buffer: Buffer): string {
  const id = crypto.randomUUID();
  audioStore.set(id, buffer);
  setTimeout(() => audioStore.delete(id), 10 * 60 * 1000);
  return id;
}

export function getAudio(id: string): Buffer | undefined {
  return audioStore.get(id);
}

export function createVideoJob(params: {
  conversationId: number;
  role: string;
  sentenceIndex: number;
  text: string;
}): VideoJob {
  const job: VideoJob = {
    id: crypto.randomUUID(),
    conversationId: params.conversationId,
    role: params.role,
    sentenceIndex: params.sentenceIndex,
    text: params.text,
    heygenVideoId: null,
    status: "generating_audio",
    videoUrl: null,
    audioId: null,
    error: null,
    createdAt: new Date().toISOString(),
  };
  videoJobs.set(job.id, job);
  return job;
}

export function getVideoJob(id: string): VideoJob | undefined {
  return videoJobs.get(id);
}

export function updateVideoJob(id: string, updates: Partial<VideoJob>): VideoJob | undefined {
  const job = videoJobs.get(id);
  if (!job) return undefined;
  Object.assign(job, updates);
  return job;
}

export function getVideoJobsByConversation(conversationId: number): VideoJob[] {
  return Array.from(videoJobs.values())
    .filter(j => j.conversationId === conversationId)
    .sort((a, b) => a.sentenceIndex - b.sentenceIndex);
}

export function approveVideoJob(id: string): VideoJob | undefined {
  return updateVideoJob(id, { status: "approved" });
}

export function splitIntoSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?।؟])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  if (sentences.length === 0 && text.trim()) {
    return [text.trim()];
  }
  return sentences;
}

export async function generateHeyGenVideo(params: {
  audioUrl: string;
  profile: HeyGenCharacterProfile;
  dimension?: { width: number; height: number };
}): Promise<{ videoId: string }> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY not configured");
  }

  const { audioUrl, profile, dimension } = params;
  const headers = {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };

  if (profile.templateId) {
    const templateBody = {
      caption: false,
      title: `Experts Room - ${profile.voiceName}`,
      variables: {
        audio_url: {
          name: "audio_url",
          type: "audio",
          properties: {
            url: audioUrl,
            asset_id: null,
          },
        },
      },
    };

    const response = await fetch(
      `${HEYGEN_BASE_URL}/v2/template/${profile.templateId}/generate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(templateBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HeyGen template API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const videoId = data?.data?.video_id;
    if (!videoId) {
      throw new Error(`HeyGen template returned no video_id: ${JSON.stringify(data)}`);
    }

    return { videoId };
  }

  if (!profile.avatarId) {
    throw new Error(`Character profile requires either templateId or avatarId for video generation. Configure an avatar ID in HEYGEN_CHARACTER_PROFILES.`);
  }

  const avatarBody: any = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: profile.avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "audio",
          audio_url: audioUrl,
        },
        background: {
          type: "color",
          value: "#1a1a2e",
        },
      },
    ],
    dimension: dimension || { width: 512, height: 512 },
    test: false,
    caption: false,
    title: `Experts Room - ${profile.voiceName}`,
  };

  const response = await fetch(`${HEYGEN_BASE_URL}/v2/video/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(avatarBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HeyGen API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const videoId = data?.data?.video_id;
  if (!videoId) {
    throw new Error(`HeyGen returned no video_id: ${JSON.stringify(data)}`);
  }

  return { videoId };
}

export async function checkHeyGenVideoStatus(videoId: string): Promise<{
  status: string;
  videoUrl: string | null;
  error: string | null;
}> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY not configured");
  }

  const response = await fetch(`${HEYGEN_BASE_URL}/v1/video_status.get?video_id=${videoId}`, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HeyGen status error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const status = data?.data?.status || "unknown";
  const videoUrl = data?.data?.video_url || null;
  const error = data?.data?.error || null;

  return { status, videoUrl, error };
}

export async function listHeyGenAvatars(): Promise<any[]> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY not configured");
  }

  const response = await fetch(`${HEYGEN_BASE_URL}/v2/avatars`, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HeyGen avatars error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.data?.avatars || [];
}
