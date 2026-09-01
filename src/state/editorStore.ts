import { create } from "zustand";
import { loadDraftProject, persistDraftProject } from "../project-schema/projectFile";
import { registerProject } from "../project-schema/projects";
import { sampleProject } from "../project-schema/sampleProject";
import {
  findScene,
  getAllScenes,
  type CharacterTransform,
  type DialogueBoxSettings,
  type DialogueRegionStyle,
  type Scene,
  type SceneExitTransition,
  type StageSettings,
  type StoryCue,
  type StoryProject,
  type TimeWheelConfig,
} from "../project-schema/types";
import { normalizeDialogueBox, normalizeStageSettings } from "../project-schema/stage";

export type AddableCueType =
  | "audio.play"
  | "background.set"
  | "character.enter"
  | "dialogue.show"
  | "transition.play"
  | "wait";

export type EditableCuePatch = Partial<{
  animation: string;
  assetRef: string;
  atMs: number;
  channel: "bgm" | "voice" | "sfx";
  characterRef: string;
  delayMs: number;
  durationMs: number;
  enterDurationMs: number;
  loop: boolean;
  speaker: string;
  subtitle: string;
  text: string;
  preset: import("../project-schema/types").StageTransitionPreset;
  holdMs: number;
  intensity: number;
  timeWheel: TimeWheelConfig;
  transform: CharacterTransform;
  transitionMs: number;
  typingCps: number;
  voiceAssetRef?: string;
  voiceStartMs?: number;
  holdAfterMs?: number;
  voiceHoldMs?: number;
  advanceWhen?: import("../project-schema/types").AdvanceWhen;
  volume: number;
  waitForAdvance: boolean;
  waitForMediaEnd?: boolean;
}>;

type EditorState = {
  project: StoryProject;
  selectedSceneId: string;
  selectedCueId: string | null;
  dirty: boolean;
  past: StoryProject[];
  future: StoryProject[];
  lastMutationKey: string | null;
  lastMutationAt: number;
  selectScene: (sceneId: string) => void;
  selectCue: (cueId: string | null) => void;
  addScene: () => void;
  renameScene: (sceneId: string, title: string) => void;
  setSceneAutoAdvance: (sceneId: string, autoAdvanceMs?: number) => void;
  setSceneExit: (
    sceneId: string,
    patch: { nextSceneId?: string | null; exitTransition?: SceneExitTransition },
  ) => void;
  setSceneEntry: (sceneId: string, transition?: SceneExitTransition | null) => void;
  setSceneEnding: (sceneId: string, transition?: SceneExitTransition | null) => void;
  deleteScene: (sceneId: string) => void;
  addCue: (sceneId: string, type: AddableCueType) => void;
  updateCue: (sceneId: string, cueId: string, patch: EditableCuePatch, field: string) => void;
  deleteCue: (sceneId: string, cueId: string) => void;
  duplicateCue: (sceneId: string, cueId: string) => void;
  moveCue: (sceneId: string, cueId: string, direction: -1 | 1) => void;
  reorderCue: (
    sceneId: string,
    cueId: string,
    targetCueId: string,
    edge: "before" | "after",
  ) => void;
  loadProject: (project: StoryProject) => void;
  markSaved: () => void;
  setDialogueHoldMs: (dialogueHoldMs?: number) => void;
  setDialogueTypingCps: (dialogueTypingCps?: number) => void;
  setDialogueFont: (dialogueFontRef?: string) => void;
  setStageSettings: (stage: Partial<StageSettings>) => void;
  setDialogueBox: (
    dialogueBox: Partial<Omit<DialogueBoxSettings, "speaker" | "subtitle" | "text" | "rule">> & {
      speaker?: Partial<DialogueRegionStyle>;
      subtitle?: Partial<DialogueRegionStyle>;
      text?: Partial<DialogueRegionStyle>;
      rule?: Partial<DialogueBoxSettings["rule"]>;
    },
  ) => void;
  applyDialogueToAll: () => void;
  undo: () => void;
  redo: () => void;
  flushDraft: () => void;
};

const historyLimit = 100;
const mutationMergeWindowMs = 800;
let draftPersistTimer: number | null = null;

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function firstCueId(project: StoryProject, sceneId: string): string | null {
  const scene = findScene(project, sceneId);
  return scene?.cues[0]?.id ?? null;
}

function persistImmediately(project: StoryProject): void {
  if (draftPersistTimer !== null) {
    window.clearTimeout(draftPersistTimer);
    draftPersistTimer = null;
  }
  try {
    persistDraftProject(project);
    registerProject(project);
  } catch (error) {
    console.warn("Unable to persist the local NeoArchive draft", error);
  }
}

function persist(project: StoryProject): void {
  if (draftPersistTimer !== null) {
    window.clearTimeout(draftPersistTimer);
  }
  draftPersistTimer = window.setTimeout(() => {
    persistImmediately(project);
    draftPersistTimer = null;
  }, 180);
}

function commitProject(
  state: EditorState,
  project: StoryProject,
  mutationKey: string | null,
): Partial<EditorState> {
  const now = Date.now();
  const shouldMergeHistory =
    mutationKey !== null &&
    state.lastMutationKey === mutationKey &&
    now - state.lastMutationAt < mutationMergeWindowMs;
  const committed = { ...project, updatedAt: new Date().toISOString() };
  persist(committed);
  return {
    project: committed,
    past: shouldMergeHistory ? state.past : [...state.past, state.project].slice(-historyLimit),
    future: [],
    dirty: true,
    lastMutationKey: mutationKey,
    lastMutationAt: now,
  };
}

function createCue(type: AddableCueType, atMs: number): StoryCue {
  switch (type) {
    case "background.set":
      return {
        id: createId("cue-background"),
        type,
        atMs,
        assetRef: "",
        transitionMs: 400,
      };
    case "character.enter":
      return {
        id: createId("cue-character"),
        type,
        atMs,
        characterRef: "character/sakurako-idol",
        animation: "Idle_01",
        delayMs: 400,
        enterDurationMs: 420,
        transform: { x: 0.5, y: 0.8, scale: 1.65 },
      };
    case "dialogue.show":
      return {
        id: createId("cue-dialogue"),
        type,
        atMs,
        speaker: "Sakurako",
        subtitle: "Trinity General School",
        text: "在这里输入下一句对白。",
        typingCps: 4,
        waitForAdvance: true,
      };
    case "audio.play":
      return {
        id: createId("cue-audio"),
        type,
        atMs,
        assetRef: "audio/your-file",
        channel: "bgm",
        loop: true,
        volume: 0.8,
      };
    case "wait":
      return {
        id: createId("cue-wait"),
        type,
        atMs,
        durationMs: 500,
        waitForAdvance: false,
      };
    case "transition.play":
      return {
        id: createId("cue-transition"),
        type,
        atMs,
        preset: "fade-black",
        durationMs: 900,
        holdMs: 120,
        intensity: 1,
      };
  }
}

const initialProject = loadDraftProject() ?? structuredClone(sampleProject);
const initialSceneId = initialProject.entrySceneId;

export const useEditorStore = create<EditorState>((set) => ({
  project: initialProject,
  selectedSceneId: initialSceneId,
  selectedCueId: firstCueId(initialProject, initialSceneId),
  dirty: false,
  past: [],
  future: [],
  lastMutationKey: null,
  lastMutationAt: 0,
  selectScene: (selectedSceneId) =>
    set((state) => ({
      selectedSceneId,
      selectedCueId: firstCueId(state.project, selectedSceneId),
      lastMutationKey: null,
    })),
  selectCue: (selectedCueId) => set({ selectedCueId, lastMutationKey: null }),
  addScene: () =>
    set((state) => {
      const project = structuredClone(state.project);
      const chapter = project.chapters[0];
      if (!chapter) {
        return state;
      }
      const sceneNumber = getAllScenes(project).length + 1;
      const sceneId = createId("scene");
      const scene: Scene = {
        id: sceneId,
        title: `新场景 ${String(sceneNumber).padStart(2, "0")}`,
        kind: "dialogue",
        cues: [createCue("background.set", 0), createCue("dialogue.show", 500)],
      };
      const activeScene = findScene(project, state.selectedSceneId);
      if (activeScene && !activeScene.nextSceneId) {
        activeScene.nextSceneId = sceneId;
      }
      chapter.scenes.push(scene);
      const committed = commitProject(state, project, null);
      return {
        ...committed,
        selectedSceneId: sceneId,
        selectedCueId: scene.cues[0].id,
      };
    }),
  renameScene: (sceneId, title) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene || scene.title === title) {
        return state;
      }
      scene.title = title;
      return commitProject(state, project, `scene:${sceneId}:title`);
    }),
  setSceneAutoAdvance: (sceneId, autoAdvanceMs) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      scene.autoAdvanceMs = autoAdvanceMs;
      return commitProject(state, project, `scene:${sceneId}:autoAdvanceMs`);
    }),
  setSceneExit: (sceneId, patch) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      if (patch.nextSceneId !== undefined) {
        scene.nextSceneId = patch.nextSceneId ?? undefined;
      }
      if (patch.exitTransition) {
        scene.exitTransition = patch.exitTransition;
      }
      return commitProject(state, project, `scene:${sceneId}:exit`);
    }),
  setSceneEntry: (sceneId, transition) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      scene.entryTransition = transition ?? undefined;
      return commitProject(state, project, `scene:${sceneId}:entry`);
    }),
  setSceneEnding: (sceneId, transition) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      scene.endingTransition = transition ?? undefined;
      return commitProject(state, project, `scene:${sceneId}:ending`);
    }),
  deleteScene: (sceneId) =>
    set((state) => {
      const scenes = getAllScenes(state.project);
      if (scenes.length <= 1) {
        return state;
      }
      const project = structuredClone(state.project);
      for (const chapter of project.chapters) {
        chapter.scenes = chapter.scenes.filter((scene) => scene.id !== sceneId);
      }
      const remainingScenes = getAllScenes(project);
      const replacementId = remainingScenes[0].id;
      for (const scene of remainingScenes) {
        if (scene.nextSceneId === sceneId) {
          scene.nextSceneId = replacementId;
        }
        for (const cue of scene.cues) {
          if (cue.type === "choice.show") {
            for (const option of cue.options) {
              if (option.targetSceneId === sceneId) {
                option.targetSceneId = replacementId;
              }
            }
          }
        }
      }
      if (project.entrySceneId === sceneId) {
        project.entrySceneId = replacementId;
      }
      const committed = commitProject(state, project, null);
      return {
        ...committed,
        selectedSceneId: replacementId,
        selectedCueId: firstCueId(project, replacementId),
      };
    }),
  addCue: (sceneId, type) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      // 一个场景只允许一张背景：加新背景时替换掉场景里已有的 background.set。
      if (type === "background.set") {
        scene.cues = scene.cues.filter((candidate) => candidate.type !== "background.set");
      }
      const nextAtMs = scene.cues.length * 500;
      const cue = createCue(type, nextAtMs);
      scene.cues.push(cue);
      const committed = commitProject(state, project, null);
      return { ...committed, selectedCueId: cue.id };
    }),
  updateCue: (sceneId, cueId, patch, field) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      const cue = scene?.cues.find((candidate) => candidate.id === cueId);
      if (!cue) {
        return state;
      }
      // 一个场景只允许一张背景：编辑背景时移除场景内其它 background.set。
      if (cue.type === "background.set" && scene) {
        scene.cues = scene.cues.filter(
          (candidate) => candidate.type !== "background.set" || candidate.id === cueId,
        );
      }
      Object.assign(cue, patch);
      if (cue.type === "dialogue.show") {
        if ("voiceAssetRef" in patch && patch.voiceAssetRef === undefined) {
          delete cue.voiceAssetRef;
        }
        if ("voiceStartMs" in patch && patch.voiceStartMs === undefined) {
          delete cue.voiceStartMs;
        }
        if ("holdAfterMs" in patch && patch.holdAfterMs === undefined) {
          delete cue.holdAfterMs;
        }
        if ("voiceHoldMs" in patch && patch.voiceHoldMs === undefined) {
          delete cue.voiceHoldMs;
        }
      }
      return commitProject(state, project, `cue:${cueId}:${field}`);
    }),
  deleteCue: (sceneId, cueId) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      const ordered = scene.cues;
      const index = ordered.findIndex((cue) => cue.id === cueId);
      scene.cues = scene.cues.filter((cue) => cue.id !== cueId);
      const nextSelection = scene.cues[Math.max(0, index - 1)]?.id ?? null;
      const committed = commitProject(state, project, null);
      return { ...committed, selectedCueId: nextSelection };
    }),
  duplicateCue: (sceneId, cueId) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      const source = scene?.cues.find((cue) => cue.id === cueId);
      if (!scene || !source) {
        return state;
      }
      const duplicate = structuredClone(source);
      duplicate.id = createId("cue");
      if (duplicate.type === "dialogue.show") {
        // 复制对白行时保留说话人/身份，清空正文与配音，方便连续录入同一人物台词。
        duplicate.text = "";
        delete duplicate.voiceAssetRef;
        delete duplicate.voiceStartMs;
      }
      const sourceIndex = scene.cues.findIndex((cue) => cue.id === cueId);
      scene.cues.splice(sourceIndex + 1, 0, duplicate);
      const committed = commitProject(state, project, null);
      return { ...committed, selectedCueId: duplicate.id };
    }),
  moveCue: (sceneId, cueId, direction) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      const cues = scene.cues;
      const index = cues.findIndex((cue) => cue.id === cueId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= cues.length) {
        return state;
      }
      [cues[index], cues[target]] = [cues[target], cues[index]];
      scene.cues = cues;
      return commitProject(state, project, null);
    }),
  reorderCue: (sceneId, cueId, targetCueId, edge) =>
    set((state) => {
      if (cueId === targetCueId) {
        return state;
      }
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      const sourceIndex = scene.cues.findIndex((cue) => cue.id === cueId);
      const targetIndex = scene.cues.findIndex((cue) => cue.id === targetCueId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return state;
      }
      const [movedCue] = scene.cues.splice(sourceIndex, 1);
      const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertionIndex = adjustedTargetIndex + (edge === "after" ? 1 : 0);
      scene.cues.splice(insertionIndex, 0, movedCue);
      return commitProject(state, project, null);
    }),
  setDialogueFont: (dialogueFontRef) =>
    set((state) => {
      if (state.project.dialogueFontRef === dialogueFontRef) {
        return state;
      }
      return commitProject(state, { ...state.project, dialogueFontRef }, "project:dialogueFont");
    }),
  setDialogueHoldMs: (dialogueHoldMs) =>
    set((state) => {
      const next = dialogueHoldMs === undefined ? undefined : Math.max(0, dialogueHoldMs);
      if (state.project.dialogueHoldMs === next) {
        return state;
      }
      return commitProject(
        state,
        { ...state.project, dialogueHoldMs: next },
        "project:dialogueHoldMs",
      );
    }),
  setDialogueTypingCps: (dialogueTypingCps) =>
    set((state) => {
      const next = dialogueTypingCps === undefined ? undefined : Math.max(1, dialogueTypingCps);
      if (state.project.dialogueTypingCps === next) {
        return state;
      }
      return commitProject(
        state,
        { ...state.project, dialogueTypingCps: next },
        "project:dialogueTypingCps",
      );
    }),
  setStageSettings: (stage) =>
    set((state) => {
      const next = normalizeStageSettings({ ...state.project.stage, ...stage });
      const current = normalizeStageSettings(state.project.stage);
      if (
        current.aspect === next.aspect &&
        current.width === next.width &&
        current.height === next.height &&
        current.backgroundFit === next.backgroundFit
      ) {
        return state;
      }
      return commitProject(state, { ...state.project, stage: next }, "project:stage");
    }),
  setDialogueBox: (dialogueBox) =>
    set((state) => {
      const current = normalizeDialogueBox(state.project.dialogueBox);
      const next = normalizeDialogueBox({
        ...current,
        ...dialogueBox,
        speaker: { ...current.speaker, ...dialogueBox.speaker },
        subtitle: { ...current.subtitle, ...dialogueBox.subtitle },
        text: { ...current.text, ...dialogueBox.text },
        rule: { ...current.rule, ...dialogueBox.rule },
      });
      return commitProject(state, { ...state.project, dialogueBox: next }, "project:dialogueBox");
    }),
  applyDialogueToAll: () =>
    set((state) => {
      const project = structuredClone(state.project);
      const holdMs = project.dialogueHoldMs ?? 2000;
      for (const chapter of project.chapters) {
        for (const scene of chapter.scenes) {
          for (const cue of scene.cues) {
            if (cue.type === "dialogue.show") {
              cue.holdAfterMs = holdMs;
            }
          }
        }
      }
      return commitProject(state, project, "project:applyAll");
    }),
  flushDraft: () => {
    persistImmediately(useEditorStore.getState().project);
  },
  loadProject: (project) => {
    persistImmediately(project);
    set({
      project,
      selectedSceneId: project.entrySceneId,
      selectedCueId: firstCueId(project, project.entrySceneId),
      dirty: false,
      past: [],
      future: [],
      lastMutationKey: null,
      lastMutationAt: 0,
    });
  },
  markSaved: () =>
    set((state) => {
      persistImmediately(state.project);
      return { dirty: false, lastMutationKey: null };
    }),
  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) {
        return state;
      }
      persist(previous);
      return {
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, historyLimit),
        dirty: true,
        selectedCueId: firstCueId(previous, state.selectedSceneId),
        lastMutationKey: null,
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) {
        return state;
      }
      persist(next);
      return {
        project: next,
        past: [...state.past, state.project].slice(-historyLimit),
        future: state.future.slice(1),
        dirty: true,
        selectedCueId: firstCueId(next, state.selectedSceneId),
        lastMutationKey: null,
      };
    }),
}));
