import { expect, it } from "vite-plus/test";
import { sampleProject } from "../project-schema/sampleProject";
import { parseProjectFile, serializeProject } from "../project-schema/projectFile";
import { StoryRuntime } from "../runtime/StoryRuntime";
import {
  normalizeCharacterEffect,
  resolveGlowColor,
  glowColorRgb,
  resolveHaloGlow,
  isHaloSlot,
} from "./characterSettings";

it("preserves character effects through files, preview reuse, updates and saves", () => {
  const project = structuredClone(sampleProject);
  const scene = project.chapters[0].scenes[0];
  const cue = scene.cues.find((item) => item.type === "character.enter")!;
  cue.characterEffect = {
    kind: "glow",
    intensity: 1.2,
    speed: 0.5,
    color: "#ff8844",
    halo: { mode: "custom", color: "#ffaa22", intensity: 0.4, speed: 0.5 },
    haloMask: { assetRef: "user:test-mask", invert: true },
  };
  const runtime = new StoryRuntime(parseProjectFile(serializeProject(project)));
  runtime.preview(scene.id, cue.id);
  expect(runtime.getSnapshot().characters[0].effect).toEqual(cue.characterEffect);
  const id = runtime.getSnapshot().characters[0].entryInstanceId;
  cue.characterEffect = { kind: "dissolve", intensity: 0.4, speed: 2 };
  runtime.replaceProject(project);
  runtime.preview(scene.id, cue.id);
  expect(runtime.getSnapshot().characters[0].entryInstanceId).toBe(id);
  expect(runtime.getSnapshot().characters[0].effect).toEqual(cue.characterEffect);
  scene.cues.push({
    id: "update",
    type: "character.update",
    atMs: 0,
    characterRef: cue.characterRef,
    transform: { x: 0.3 },
  });
  runtime.replaceProject(project);
  runtime.preview(scene.id, "update");
  expect(runtime.getSnapshot().characters[0].effect).toEqual(cue.characterEffect);
  const restored = new StoryRuntime(project);
  restored.restoreSaveSnapshot(runtime.createSaveSnapshot());
  expect(restored.getSnapshot().characters[0].effect).toEqual(cue.characterEffect);
  cue.characterEffect = null;
  runtime.replaceProject(project);
  runtime.preview(scene.id, cue.id);
  expect(runtime.getSnapshot().characters[0].effect).toBeNull();
});

it("accepts old characters and clamps effect parameters", () => {
  expect(normalizeCharacterEffect()).toBeNull();
  expect(normalizeCharacterEffect({ kind: "glow", intensity: Infinity, speed: -2 })).toEqual({
    kind: "glow",
    intensity: 1,
    speed: 0.25,
  });
});

it("validates glow colors and converts them into GPU channels", () => {
  expect(resolveGlowColor("#FF8844")).toBe("#ff8844");
  expect(resolveGlowColor("not-a-color")).toBe("#4dd9ff");
  expect(glowColorRgb("#ff0000")).toEqual([1, 0, 0]);
  expect(glowColorRgb("#00ff00")).toEqual([0, 1, 0]);
});

it("keeps halo disabled by default and separates its settings from the body", () => {
  const effect = { kind: "glow" as const, intensity: 1.5, speed: 2, color: "#ff0000" };
  expect(resolveHaloGlow(effect)).toBeNull();
  expect(resolveHaloGlow({ ...effect, halo: { mode: "follow" } })).toEqual(effect);
  expect(
    resolveHaloGlow({
      ...effect,
      halo: { mode: "custom", intensity: 0, speed: 0.5, color: "#00ff00" },
    }),
  ).toEqual({ kind: "glow", intensity: 0, speed: 0.5, color: "#00ff00" });
  expect(
    isHaloSlot({
      data: { name: "Halo_01" },
      bone: { data: { name: "root" } },
      getAttachment: () => null,
    }),
  ).toBe(true);
  expect(
    isHaloSlot({
      data: { name: "Hair" },
      bone: { data: { name: "Head" } },
      getAttachment: () => ({ name: "Hair" }),
    }),
  ).toBe(false);
});
