import { useEffect, useRef, useState } from "react";
import {
  findScene,
  gatesSatisfied,
  resolveAdvanceWhen,
  resolveDialogueHoldMs,
  type StoryProject,
} from "../project-schema/types";
import type { PlaybackState, StoryRuntime } from "./StoryRuntime";

type GateState = {
  cueId: string | null;
  text: boolean;
  voice: boolean;
  backgroundVideo: boolean;
};

const idleGates: GateState = {
  cueId: null,
  text: false,
  voice: false,
  backgroundVideo: false,
};

export function useAutoAdvance(
  project: StoryProject,
  playback: PlaybackState,
  runtime: StoryRuntime,
  enabled: boolean,
) {
  const [gates, setGates] = useState<GateState>(idleGates);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const cueId = playback.dialogue?.cueId ?? null;
    setGates((current) =>
      current.cueId === cueId
        ? current
        : { cueId, text: false, voice: false, backgroundVideo: false },
    );
  }, [playback.dialogue?.cueId]);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (
      !enabled ||
      !playback.dialogue ||
      playback.status !== "waiting_user" ||
      playback.choices.length > 0
    ) {
      return;
    }
    const scene = playback.sceneId ? findScene(project, playback.sceneId) : undefined;
    const dialogueCue = scene?.cues.find(
      (cue) => cue.id === playback.dialogue?.cueId && cue.type === "dialogue.show",
    );
    if (!dialogueCue || dialogueCue.type !== "dialogue.show" || gates.cueId !== dialogueCue.id) {
      return;
    }
    const required = resolveAdvanceWhen(dialogueCue);
    const ready = {
      text: gates.text || !required.text,
      voice: gates.voice || !required.voice || !dialogueCue.voiceAssetRef,
      backgroundVideo: gates.backgroundVideo || !required.backgroundVideo,
    };
    if (!gatesSatisfied(required, ready)) {
      return;
    }
    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        runtime.advance();
      },
      resolveDialogueHoldMs(dialogueCue, scene),
    );
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, gates, playback, project, runtime]);

  return {
    markTextComplete: (cueId?: string | null) => {
      const id = cueId ?? playback.dialogue?.cueId;
      if (!id) {
        return;
      }
      setGates((current) =>
        id === playback.dialogue?.cueId
          ? {
              cueId: id,
              text: true,
              voice: current.cueId === id ? current.voice : false,
              backgroundVideo: current.cueId === id ? current.backgroundVideo : false,
            }
          : current,
      );
    },
    markVoiceEnded: (cueId?: string) => {
      const id = cueId ?? playback.dialogue?.cueId;
      if (!id) {
        return;
      }
      setGates((current) => (current.cueId === id ? { ...current, voice: true } : current));
    },
    markBackgroundVideoEnded: () => {
      setGates((current) => (current.cueId ? { ...current, backgroundVideo: true } : current));
    },
  };
}
