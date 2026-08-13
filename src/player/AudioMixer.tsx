import { useEffect, useRef } from "react";
import { resolveAudio } from "../assets/catalog";
import type { PlaybackState, RuntimeAudio } from "../runtime/StoryRuntime";

export type AudioSettings = {
  masterVolume: number;
  muted: boolean;
};

type ChannelPlayerProps = {
  audio: RuntimeAudio;
  paused: boolean;
  settings: AudioSettings;
};

function ChannelPlayer({ audio, paused, settings }: ChannelPlayerProps) {
  const elementRef = useRef<HTMLAudioElement>(null);
  const source = resolveAudio(audio.assetRef);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    element.loop = audio.loop;
    element.muted = settings.muted;
    element.volume = Math.max(0, Math.min(1, audio.volume * settings.masterVolume));

    if (paused) {
      element.pause();
      return;
    }
    void element.play().catch(() => {
      // Browser autoplay policies defer playback until the next user interaction.
    });
  }, [audio.loop, audio.volume, paused, settings.masterVolume, settings.muted]);

  if (!source) {
    return null;
  }

  return <audio autoPlay preload="auto" ref={elementRef} src={source} />;
}

export function AudioMixer({
  audio,
  settings,
  status,
}: Pick<PlaybackState, "audio" | "status"> & { settings: AudioSettings }) {
  const paused = status === "idle" || status === "paused" || status === "error";

  return (
    <div aria-hidden="true">
      {Object.values(audio).map((channel) =>
        channel ? (
          <ChannelPlayer
            audio={channel}
            key={`${channel.channel}:${channel.assetRef}`}
            paused={paused}
            settings={settings}
          />
        ) : null,
      )}
    </div>
  );
}
