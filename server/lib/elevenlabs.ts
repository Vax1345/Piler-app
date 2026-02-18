
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import WebSocket from 'ws';

let connectionSettings: any;

async function getCredentials() {
  if (process.env.ELEVENLABS_API_KEY) {
    return process.env.ELEVENLABS_API_KEY;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('ElevenLabs API key not found. Set ELEVENLABS_API_KEY or connect via Replit connector.');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=elevenlabs',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error('ElevenLabs not connected');
  }
  return connectionSettings.settings.api_key;
}

// Get a fresh ElevenLabs SDK client
export async function getUncachableElevenLabsClient() {
  const apiKey = await getCredentials();
  return new ElevenLabsClient({ apiKey });
}

// Get API key for WebSocket streaming
export async function getElevenLabsApiKey() {
  return await getCredentials();
}

/**
 * WebSocket streaming for real-time text-to-speech.
 * Streams text in as it's generated (e.g., from an LLM) and receives audio chunks in real-time.
 * 
 * @param voiceId - ElevenLabs voice ID (e.g., 'Xb7hH8MSUJpSbSDYk0k2')
 * @param onAudioChunk - Callback for each audio chunk (base64 encoded PCM16 at 16kHz)
 * @param options - Optional settings: modelId (default: 'eleven_flash_v2_5'), outputFormat (default: 'pcm_16000')
 * @returns Object with send() to stream text and close() to finish
 */
export async function createElevenLabsStreamingTTS(
  voiceId: string,
  onAudioChunk: (audioBase64: string) => void,
  options: { modelId?: string; outputFormat?: string } = {}
) {
  const { modelId = 'eleven_flash_v2_5', outputFormat = 'pcm_16000' } = options;
  const apiKey = await getCredentials();
  const uri = 'wss://api.elevenlabs.io/v1/text-to-speech/' + voiceId + '/stream-input?model_id=' + modelId + '&output_format=' + outputFormat;
  
  const websocket = new WebSocket(uri, {
    headers: { 'xi-api-key': apiKey },
  });

  return new Promise<{
    send: (text: string) => void;
    flush: () => void;
    close: () => void;
  }>((resolve, reject) => {
    websocket.on('error', reject);
    
    websocket.on('open', () => {
      // Initialize connection with voice settings
      websocket.send(JSON.stringify({
        text: ' ',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: false },
        generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
      }));

      resolve({
        // Stream text as it arrives (e.g., from LLM token by token)
        send: (text: string) => {
          websocket.send(JSON.stringify({ text }));
        },
        // Force generate any buffered text immediately
        flush: () => {
          websocket.send(JSON.stringify({ text: ' ', flush: true }));
        },
        // Close connection (sends empty string to signal end)
        close: () => {
          websocket.send(JSON.stringify({ text: '' }));
        },
      });
    });

    // Handle incoming audio chunks
    websocket.on('message', (event) => {
      const data = JSON.parse(event.toString());
      if (data.audio) {
        onAudioChunk(data.audio);
      }
    });
  });
}

/**
 * Transcribe audio to text using ElevenLabs Speech-to-Text API.
 * 
 * @param audioBuffer - Audio file as Buffer (supports mp3, wav, webm, etc.)
 * @param filename - Filename with extension (e.g., 'audio.mp3')
 * @returns Transcribed text
 */
export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const apiKey = await getCredentials();
  
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model_id', 'scribe_v1');
  
  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error('Transcription failed: ' + response.statusText);
  }
  
  const result = await response.json();
  return result.text;
}
