import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { StoryProject } from "../project-schema/types";
import { StoryRuntime } from "./StoryRuntime";

export function useStoryRuntime(project: StoryProject, sceneId?: string, cueId?: string) {
  const runtime = useMemo(() => new StoryRuntime(project), []);
  const livePlaybackRef = useRef(false);
  const playback = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );

  useEffect(() => {
    if (playback.status === "completed" || playback.status === "idle") {
      livePlaybackRef.current = false;
    }
  }, [playback.status]);

  useEffect(() => {
    runtime.replaceProject(project);
    if (livePlaybackRef.current) {
      return;
    }
    runtime.preview(sceneId ?? project.entrySceneId, cueId);
  }, [cueId, project, runtime, sceneId]);

  const startScene = (nextSceneId?: string) => {
    livePlaybackRef.current = true;
    runtime.start(nextSceneId);
  };

  const previewCue = (nextSceneId: string, nextCueId?: string, forceReplay = false) => {
    livePlaybackRef.current = false;
    runtime.preview(nextSceneId, nextCueId, forceReplay);
  };

  return {
    playback,
    runtime,
    startScene,
    previewCue,
    isLivePlayback: () => livePlaybackRef.current,
  };
}
