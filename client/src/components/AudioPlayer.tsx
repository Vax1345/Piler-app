import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

interface AudioPlayerProps {
  base64Audio: string | null;
  onEnded?: () => void;
}

export interface AudioPlayerHandle {
  stop: () => void;
}

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  ({ base64Audio, onEnded }, ref) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useImperativeHandle(ref, () => ({
      stop: () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      }
    }));

    useEffect(() => {
      if (base64Audio && audioRef.current) {
        console.log("AudioPlayer: Received audio data, length:", base64Audio.length);
        
        const audio = audioRef.current;
        audio.pause();
        
        const dataUrl = `data:audio/wav;base64,${base64Audio}`;
        audio.src = dataUrl;
        audio.load();
        
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("AudioPlayer: Playback started successfully");
            })
            .catch((error) => {
              console.error("AudioPlayer: Playback failed:", error.message);
              if (error.name === 'NotAllowedError') {
                console.log("AudioPlayer: Autoplay blocked - user interaction required");
              }
            });
        }
      }
    }, [base64Audio]);

    return (
      <audio
        ref={audioRef}
        onEnded={() => {
          console.log("AudioPlayer: Playback ended");
          onEnded?.();
        }}
        onError={(e) => {
          console.error("AudioPlayer: Audio error:", e);
        }}
        onCanPlay={() => {
          console.log("AudioPlayer: Audio can play");
        }}
        className="hidden"
      />
    );
  }
);

AudioPlayer.displayName = "AudioPlayer";
