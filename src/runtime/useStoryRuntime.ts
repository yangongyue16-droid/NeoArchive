import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { StoryProject } from "../project-schema/types";
import { StoryRuntime } from "./StoryRuntime";

export function useStoryRuntime(project: StoryProject, sceneId?: string, cueId?: string) {
  const runtime = useMemo(() => new StoryRuntime(project), []);
  const playback = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );

  useEffect(() => {
    runtime.replaceProject(project);
    runtime.preview(sceneId ?? project.entrySceneId, cueId);
  }, [cueId, project, runtime, sceneId]);

  return { playback, runtime };
}
