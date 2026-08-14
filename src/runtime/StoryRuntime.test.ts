import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { sampleProject } from "../project-schema/sampleProject";
import { StoryRuntime } from "./StoryRuntime";

function completeStageActions(runtime: StoryRuntime): void {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const before = runtime.getSnapshot();
    runtime.notifyBackgroundTransitionCompleted(before.backgroundInstanceId);
    vi.runOnlyPendingTimers();
    for (const character of runtime.getSnapshot().characters) {
      runtime.notifyCharacterEnterCompleted(character.entryInstanceId);
    }
    const after = runtime.getSnapshot();
    if (after.status !== "playing") {
      return;
    }
    if (
      before.currentCueIndex === after.currentCueIndex &&
      before.backgroundInstanceId === after.backgroundInstanceId &&
      before.characters.length === after.characters.length
    ) {
      return;
    }
  }
}

describe("StoryRuntime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("projects the first scene until the dialogue boundary", () => {
    const runtime = new StoryRuntime(sampleProject);

    runtime.start();
    completeStageActions(runtime);

    expect(runtime.getSnapshot()).toMatchObject({
      status: "waiting_user",
      sceneId: "scene-001",
      backgroundRef: "background/classroom",
      dialogue: { speaker: "Sakurako" },
    });
    expect(runtime.getSnapshot().characters).toHaveLength(1);
  });

  it("uses vertical cue order instead of legacy millisecond values", () => {
    const project = structuredClone(sampleProject);
    const firstScene = project.chapters[0]?.scenes[0];
    const firstDialogue = firstScene?.cues.find((cue) => cue.id === "cue-dialogue-001");
    const secondDialogue = firstScene?.cues.find((cue) => cue.id === "cue-dialogue-001b");
    if (!firstDialogue || !secondDialogue) {
      throw new Error("Expected dialogue fixtures");
    }
    firstDialogue.atMs = 9000;
    secondDialogue.atMs = 0;

    const runtime = new StoryRuntime(project);
    runtime.start();
    completeStageActions(runtime);

    expect(runtime.getSnapshot().dialogue?.cueId).toBe("cue-dialogue-001");
    runtime.advance();
    expect(runtime.getSnapshot().dialogue?.cueId).toBe("cue-dialogue-001b");
  });

  it("advances through script lines and then to the next scene", () => {
    const runtime = new StoryRuntime(sampleProject);
    runtime.start();
    completeStageActions(runtime);

    runtime.advance();
    completeStageActions(runtime);

    expect(runtime.getSnapshot()).toMatchObject({
      status: "waiting_user",
      sceneId: "scene-001",
      dialogue: { cueId: "cue-dialogue-001b", speaker: "老师" },
    });

    runtime.advance();
    completeStageActions(runtime);

    expect(runtime.getSnapshot()).toMatchObject({
      status: "waiting_user",
      sceneId: "scene-002",
      backgroundRef: "background/rooftop",
    });
  });

  it("plays a scene exit transition before entering the next scene", () => {
    const project = structuredClone(sampleProject);
    const firstScene = project.chapters[0]?.scenes[0];
    if (!firstScene) {
      throw new Error("Expected first scene fixture");
    }
    firstScene.exitTransition = {
      preset: "fade-black",
      durationMs: 900,
      holdMs: 80,
      intensity: 1,
    };

    const runtime = new StoryRuntime(project);
    runtime.start();
    completeStageActions(runtime);
    runtime.advance();
    runtime.advance();

    const transitionInstanceId = runtime.getSnapshot().transition?.instanceId;
    if (transitionInstanceId === undefined) {
      throw new Error("Expected exit transition instance");
    }

    expect(runtime.getSnapshot()).toMatchObject({
      status: "playing",
      sceneId: "scene-001",
      dialogue: null,
      transition: { preset: "fade-black" },
    });

    runtime.notifyTransitionCovered(transitionInstanceId);
    runtime.notifyTransitionCompleted(transitionInstanceId);
    completeStageActions(runtime);
    expect(runtime.getSnapshot()).toMatchObject({
      status: "waiting_user",
      sceneId: "scene-002",
      dialogue: { cueId: "cue-dialogue-002" },
    });
  });

  it("plays a terminal transition before entering the next scene", () => {
    const project = structuredClone(sampleProject);
    const firstScene = project.chapters[0]?.scenes[0];
    if (!firstScene) {
      throw new Error("Expected first scene fixture");
    }
    firstScene.cues.push({
      id: "cue-transition-outgoing",
      type: "transition.play",
      atMs: 1400,
      preset: "chromatic-slice",
      durationMs: 1200,
      holdMs: 500,
      intensity: 1,
    });

    const runtime = new StoryRuntime(project);
    runtime.start();
    completeStageActions(runtime);
    runtime.advance();
    runtime.advance();

    const transitionInstanceId = runtime.getSnapshot().transition?.instanceId;
    if (transitionInstanceId === undefined) {
      throw new Error("Expected transition instance");
    }

    expect(runtime.getSnapshot()).toMatchObject({
      status: "playing",
      sceneId: "scene-001",
      dialogue: null,
      transition: { preset: "chromatic-slice" },
    });

    runtime.notifyTransitionCovered(transitionInstanceId);
    expect(runtime.getSnapshot()).toMatchObject({
      status: "playing",
      sceneId: "scene-002",
      backgroundRef: "background/rooftop",
      characters: [],
      dialogue: null,
      transition: {
        instanceId: transitionInstanceId,
        preset: "chromatic-slice",
      },
    });

    runtime.notifyTransitionCompleted(transitionInstanceId);
    expect(runtime.getSnapshot()).toMatchObject({
      status: "playing",
      sceneId: "scene-002",
      backgroundRef: "background/rooftop",
      transition: null,
    });
    expect(runtime.getSnapshot().characters).toHaveLength(0);

    completeStageActions(runtime);
    expect(runtime.getSnapshot()).toMatchObject({
      status: "waiting_user",
      dialogue: { cueId: "cue-dialogue-002" },
    });
  });

  it("does not mount the next scene character beneath an outgoing transition", () => {
    const project = structuredClone(sampleProject);
    const firstScene = project.chapters[0]?.scenes[0];
    const secondScene = project.chapters[0]?.scenes[1];
    const nextCharacter = secondScene?.cues.find((cue) => cue.type === "character.enter");
    if (!firstScene || !secondScene || !nextCharacter || nextCharacter.type !== "character.enter") {
      throw new Error("Expected transition scene fixtures");
    }
    firstScene.cues.push({
      id: "cue-transition-outgoing-delayed-character",
      type: "transition.play",
      atMs: 1400,
      preset: "chromatic-slice",
      durationMs: 1200,
      holdMs: 500,
      intensity: 1,
    });
    nextCharacter.delayMs = 300;

    const runtime = new StoryRuntime(project);
    runtime.start();
    completeStageActions(runtime);
    runtime.advance();
    runtime.advance();

    const transitionInstanceId = runtime.getSnapshot().transition?.instanceId;
    if (transitionInstanceId === undefined) {
      throw new Error("Expected transition instance");
    }

    runtime.notifyTransitionCovered(transitionInstanceId);
    expect(runtime.getSnapshot()).toMatchObject({
      sceneId: "scene-002",
      backgroundRef: "background/rooftop",
      characters: [],
      dialogue: null,
    });

    runtime.notifyTransitionCompleted(transitionInstanceId);
    expect(runtime.getSnapshot()).toMatchObject({ status: "playing", characters: [] });

    vi.advanceTimersByTime(299);
    expect(runtime.getSnapshot().characters).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(runtime.getSnapshot()).toMatchObject({
      status: "playing",
      dialogue: null,
    });
    expect(runtime.getSnapshot().characters).toHaveLength(1);

    runtime.notifyCharacterEnterCompleted(
      runtime.getSnapshot().characters[0]?.entryInstanceId ?? -1,
    );
    expect(runtime.getSnapshot()).toMatchObject({
      status: "waiting_user",
      dialogue: { cueId: "cue-dialogue-002" },
    });
    expect(runtime.getSnapshot().characters).toHaveLength(1);
  });

  it("previews the selected cue with the projected stage state", () => {
    const runtime = new StoryRuntime(sampleProject);

    runtime.preview("scene-001", "cue-dialogue-001b");

    expect(runtime.getSnapshot()).toMatchObject({
      status: "waiting_user",
      backgroundRef: "background/classroom",
      dialogue: { cueId: "cue-dialogue-001b", speaker: "老师" },
    });
    expect(runtime.getSnapshot().characters).toHaveLength(1);
  });

  it("does not replay earlier background and character entrances while previewing later cues", () => {
    const runtime = new StoryRuntime(sampleProject);

    runtime.preview("scene-001", "cue-character-001");
    const characterEntryInstance = runtime.getSnapshot().characters[0]?.entryInstanceId;
    const backgroundInstance = runtime.getSnapshot().backgroundInstanceId;

    runtime.preview("scene-001", "cue-dialogue-001");
    expect(runtime.getSnapshot().characters[0]?.entryInstanceId).toBe(characterEntryInstance);
    expect(runtime.getSnapshot().backgroundInstanceId).toBe(backgroundInstance);

    runtime.preview("scene-001", "cue-dialogue-001b");
    expect(runtime.getSnapshot().characters[0]?.entryInstanceId).toBe(characterEntryInstance);
    expect(runtime.getSnapshot().backgroundInstanceId).toBe(backgroundInstance);
  });

  it("replays an entrance only when the selected action is explicitly refreshed", () => {
    const runtime = new StoryRuntime(sampleProject);

    runtime.preview("scene-001", "cue-character-001");
    const firstInstance = runtime.getSnapshot().characters[0]?.entryInstanceId ?? 0;
    runtime.preview("scene-001", "cue-character-001");
    expect(runtime.getSnapshot().characters[0]?.entryInstanceId).toBe(firstInstance);

    runtime.preview("scene-001", "cue-character-001", true);
    expect(runtime.getSnapshot().characters[0]?.entryInstanceId).toBeGreaterThan(firstInstance);
  });

  it("keeps historical stage instances when refreshing a dialogue", () => {
    const runtime = new StoryRuntime(sampleProject);

    runtime.preview("scene-001", "cue-dialogue-001");
    const characterEntryInstance = runtime.getSnapshot().characters[0]?.entryInstanceId;
    const backgroundInstance = runtime.getSnapshot().backgroundInstanceId;

    runtime.preview("scene-001", "cue-dialogue-001", true);
    expect(runtime.getSnapshot().characters[0]?.entryInstanceId).toBe(characterEntryInstance);
    expect(runtime.getSnapshot().backgroundInstanceId).toBe(backgroundInstance);
  });

  it("creates and restores a versioned quick-save snapshot", () => {
    const runtime = new StoryRuntime(sampleProject);
    runtime.start();
    completeStageActions(runtime);
    runtime.advance();
    const snapshot = runtime.createSaveSnapshot();

    runtime.start("scene-003");
    runtime.restoreSaveSnapshot(snapshot);

    expect(runtime.getSnapshot().dialogue?.cueId).toBe("cue-dialogue-001b");
  });

  it("projects a versioned stage transition event", () => {
    const runtime = new StoryRuntime(sampleProject);

    runtime.preview("scene-002", "cue-transition-002");
    const firstInstance = runtime.getSnapshot().transition?.instanceId;
    runtime.preview("scene-002", "cue-transition-002");

    expect(runtime.getSnapshot().transition).toMatchObject({
      preset: "archive-shutter",
      durationMs: 1100,
      holdMs: 120,
      intensity: 1,
    });
    expect(runtime.getSnapshot().transition?.instanceId).toBeGreaterThan(firstInstance ?? 0);
  });

  it("does not replay an earlier transition while editing a later cue", () => {
    const runtime = new StoryRuntime(sampleProject);

    runtime.preview("scene-002", "cue-dialogue-002");

    expect(runtime.getSnapshot().transition).toBeNull();
    expect(runtime.getSnapshot().dialogue?.cueId).toBe("cue-dialogue-002");
  });

  it("carries project-defined time-wheel display settings into playback", () => {
    const project = structuredClone(sampleProject);
    const transition = project.chapters[0]?.scenes[1]?.cues.find(
      (cue) => cue.type === "transition.play",
    );
    if (!transition || transition.type !== "transition.play") {
      throw new Error("Expected transition fixture");
    }
    transition.preset = "chromatic-slice";
    transition.timeWheel = {
      source: "custom",
      customDateTime: "2032-04-17T09:26:00",
      precision: "minute",
      showDate: true,
      showWeekday: false,
      showTime: true,
      showTimezone: false,
    };

    const runtime = new StoryRuntime(project);
    runtime.preview("scene-002", transition.id);

    expect(runtime.getSnapshot().transition?.timeWheel).toEqual(transition.timeWheel);
  });

  it("supports choice completion and replay branches", () => {
    const runtime = new StoryRuntime(sampleProject);
    runtime.start("scene-003");
    completeStageActions(runtime);
    runtime.advance();

    expect(runtime.getSnapshot().choices).toHaveLength(2);
    runtime.choose("choice-review");
    expect(runtime.getSnapshot().sceneId).toBe("scene-001");
  });

  it("sequences background fade and delayed character entry", () => {
    const project = structuredClone(sampleProject);
    const firstScene = project.chapters[0]?.scenes[0];
    const character = firstScene?.cues.find((cue) => cue.type === "character.enter");
    if (!firstScene || !character || character.type !== "character.enter") {
      throw new Error("Expected scene timing fixtures");
    }
    const background = firstScene.cues.find((cue) => cue.type === "background.set");
    if (!background || background.type !== "background.set") {
      throw new Error("Expected background fixture");
    }
    background.transitionMs = 400;
    character.delayMs = 300;

    const runtime = new StoryRuntime(project);
    runtime.start();

    expect(runtime.getSnapshot()).toMatchObject({
      status: "playing",
      backgroundRef: "background/classroom",
      characters: [],
      dialogue: null,
    });

    runtime.notifyBackgroundTransitionCompleted(runtime.getSnapshot().backgroundInstanceId);

    vi.advanceTimersByTime(299);
    expect(runtime.getSnapshot().characters).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(runtime.getSnapshot()).toMatchObject({ status: "playing", dialogue: null });
    expect(runtime.getSnapshot().characters).toHaveLength(1);

    runtime.notifyCharacterEnterCompleted(
      runtime.getSnapshot().characters[0]?.entryInstanceId ?? -1,
    );
    expect(runtime.getSnapshot()).toMatchObject({
      status: "waiting_user",
      dialogue: { cueId: "cue-dialogue-001" },
    });
    expect(runtime.getSnapshot().characters).toHaveLength(1);
  });
});
