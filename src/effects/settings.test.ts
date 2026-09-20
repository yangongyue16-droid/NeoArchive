import { describe, expect, it } from "vite-plus/test";
import { normalizeBackgroundEffect } from "./settings";
import { mediaRect } from "./mediaTexture";
import { parseProjectFile, serializeProject } from "../project-schema/projectFile";
import { sampleProject } from "../project-schema/sampleProject";
import { StoryRuntime } from "../runtime/StoryRuntime";
import type { BackgroundSetCue, StoryProject } from "../project-schema/types";

function projectWithEffect(): { project: StoryProject; cue: BackgroundSetCue } {
  const project = structuredClone(sampleProject);
  const cue = project.chapters[0].scenes[0].cues.find((item) => item.type === "background.set")!;
  cue.effect = { kind: "frost", intensity: 1.4, speed: 0.5, coverDialogue: true };
  return { project, cue };
}

describe("background effects", () => {
  it("preserves effects in JSON and runtime preview, including changes to a reused background", () => {
    const { project, cue } = projectWithEffect();
    const restored = parseProjectFile(serializeProject(project));
    const runtime = new StoryRuntime(restored);
    runtime.preview(restored.entrySceneId);
    expect(runtime.getSnapshot().backgroundEffect).toEqual(cue.effect);
    const instanceId = runtime.getSnapshot().backgroundInstanceId;
    cue.effect = { kind: "glitch", intensity: 0.7, speed: 2 };
    runtime.replaceProject(project);
    runtime.preview(project.entrySceneId);
    expect(runtime.getSnapshot().backgroundInstanceId).toBe(instanceId);
    expect(runtime.getSnapshot().backgroundEffect).toEqual(cue.effect);
    cue.effect = null;
    runtime.replaceProject(project);
    runtime.preview(project.entrySceneId);
    expect(runtime.getSnapshot().backgroundEffect).toBeNull();
  });

  it("carries the effect into playback and saved snapshots", () => {
    const { project, cue } = projectWithEffect();
    const runtime = new StoryRuntime(project);
    runtime.start();
    expect(runtime.getSnapshot().backgroundEffect).toEqual(cue.effect);
    const saved = runtime.createSaveSnapshot();
    const restoredRuntime = new StoryRuntime(project);
    restoredRuntime.restoreSaveSnapshot(saved);
    expect(restoredRuntime.getSnapshot().backgroundEffect).toEqual(cue.effect);
    runtime.preview(project.entrySceneId);
  });

  it("clamps invalid imported parameters and accepts old projects without effects", () => {
    expect(normalizeBackgroundEffect()).toBeNull();
    expect(normalizeBackgroundEffect({ kind: "vhs", intensity: 100, speed: -2 })).toEqual({
      kind: "vhs",
      intensity: 2,
      speed: 0.25,
    });
    expect(normalizeBackgroundEffect({ kind: "frost", intensity: NaN, speed: Infinity })).toEqual({
      kind: "frost",
      intensity: 1,
      speed: 1,
    });
    const runtime = new StoryRuntime(sampleProject);
    runtime.preview(sampleProject.entrySceneId);
    expect(runtime.getSnapshot().backgroundEffect).toBeNull();
  });

  it("matches the background's crop and letterbox geometry", () => {
    expect(mediaRect(1920, 1080, 400, 400, "cover")).toEqual({
      x: (400 - 1920 * (400 / 1080)) / 2,
      y: 0,
      width: 1920 * (400 / 1080),
      height: 400,
    });
    expect(mediaRect(1920, 1080, 400, 400, "contain")).toEqual({
      x: 0,
      y: 87.5,
      width: 400,
      height: 225,
    });
    expect(mediaRect(1920, 1080, 400, 400, "fill")).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
    });
  });
});
