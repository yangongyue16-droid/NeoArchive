import { create } from "zustand";
import { getCharacterMetadata } from "../assets/catalog";
import { loadDraftProject, persistDraftProject } from "../project-schema/projectFile";
import { sampleProject } from "../project-schema/sampleProject";
import {
  findScene,
  getAllScenes,
  type CharacterTransform,
  type Scene,
  type StoryCue,
  type StoryProject,
  type TimeWheelConfig,
} from "../project-schema/types";

export type AddableCueType =
  | "audio.play"
  | "background.set"
  | "character.enter"
  | "character.update"
  | "character.exit"
  | "choice.show"
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
  options: import("../project-schema/types").ChoiceOption[];
  prompt: string;
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
  volume: number;
  waitForAdvance: boolean;
}>;

type CueCreationContext = {
  characterRef?: string;
  speaker?: string;
  subtitle?: string;
};

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
  addScene: (title?: string) => string;
  renameScene: (sceneId: string, title: string) => void;
  setSceneAutoAdvance: (sceneId: string, autoAdvanceMs?: number) => void;
  setSceneNext: (sceneId: string, nextSceneId?: string) => void;
  setEntryScene: (sceneId: string) => void;
  addBranchScene: (sourceSceneId: string, choiceCueId?: string, optionId?: string) => string;
  deleteScene: (sceneId: string) => void;
  addCue: (sceneId: string, type: AddableCueType) => void;
  addAudioCue: (sceneId: string, assetRef: string, channel: "bgm" | "voice" | "sfx") => void;
  updateCue: (sceneId: string, cueId: string, patch: EditableCuePatch, field: string) => void;
  addChoiceOption: (sceneId: string, cueId: string, label?: string, targetSceneId?: string) => void;
  updateChoiceOption: (
    sceneId: string,
    cueId: string,
    optionId: string,
    patch: Partial<import("../project-schema/types").ChoiceOption>,
  ) => void;
  deleteChoiceOption: (sceneId: string, cueId: string, optionId: string) => void;
  reorderChoiceOption: (
    sceneId: string,
    cueId: string,
    optionId: string,
    direction: -1 | 1,
  ) => void;
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
  undo: () => void;
  redo: () => void;
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
  if (typeof window !== "undefined" && draftPersistTimer !== null) {
    window.clearTimeout(draftPersistTimer);
    draftPersistTimer = null;
  }
  try {
    persistDraftProject(project);
  } catch (error) {
    console.warn("Unable to persist the local NeoArchive draft", error);
  }
}

function persist(project: StoryProject): void {
  if (typeof window !== "undefined") {
    if (draftPersistTimer !== null) {
      window.clearTimeout(draftPersistTimer);
    }
    draftPersistTimer = window.setTimeout(() => {
      persistImmediately(project);
      draftPersistTimer = null;
    }, 180);
  } else {
    persistImmediately(project);
  }
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

function createCue(type: AddableCueType, atMs: number, context?: CueCreationContext): StoryCue {
  switch (type) {
    case "background.set":
      return {
        id: createId("cue-background"),
        type,
        atMs,
        assetRef: "background/classroom",
        transitionMs: 400,
      };
    case "character.enter":
      return {
        id: createId("cue-character"),
        type,
        atMs,
        characterRef: context?.characterRef ?? "character/sakurako-idol",
        animation: "01",
        delayMs: 400,
        enterDurationMs: 420,
        transform: { x: 0.5, y: 0.72, scale: 1.05 },
      };
    case "character.update":
      return {
        id: createId("cue-character-update"),
        type,
        atMs,
        characterRef: context?.characterRef ?? "character/sakurako-idol",
        animation: "03",
      };
    case "character.exit":
      return {
        id: createId("cue-character-exit"),
        type,
        atMs,
        characterRef: context?.characterRef ?? "character/sakurako-idol",
      };
    case "dialogue.show":
      return {
        id: createId("cue-dialogue"),
        type,
        atMs,
        speaker: context?.speaker ?? "Sakurako",
        subtitle: context?.subtitle ?? "Trinity General School",
        text: "在这里输入下一句对白。",
        typingCps: 36,
        waitForAdvance: true,
      };
    case "audio.play":
      return {
        id: createId("cue-audio"),
        type,
        atMs,
        assetRef: "audio/cc0/tozan-background-music-1.ogg",
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
    case "choice.show":
      return {
        id: createId("cue-choice"),
        type,
        atMs,
        prompt: "请选择接下来的行动：",
        options: [
          { id: createId("opt"), label: "选项 A" },
          { id: createId("opt"), label: "选项 B" },
        ],
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
  addScene: (customTitle?: string) => {
    let createdSceneId = "";
    set((state) => {
      const project = structuredClone(state.project);
      const chapter = project.chapters[0];
      if (!chapter) {
        return state;
      }
      const sceneNumber = getAllScenes(project).length + 1;
      const sceneId = createId("scene");
      createdSceneId = sceneId;
      const scene: Scene = {
        id: sceneId,
        title: customTitle || `新场景 ${String(sceneNumber).padStart(2, "0")}`,
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
    });
    return createdSceneId;
  },
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
  setSceneNext: (sceneId, nextSceneId) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene || scene.nextSceneId === nextSceneId) {
        return state;
      }
      scene.nextSceneId = nextSceneId || undefined;
      return commitProject(state, project, `scene:${sceneId}:nextSceneId`);
    }),
  setEntryScene: (sceneId) =>
    set((state) => {
      if (state.project.entrySceneId === sceneId) {
        return state;
      }
      const project = structuredClone(state.project);
      project.entrySceneId = sceneId;
      return commitProject(state, project, "project:entrySceneId");
    }),
  addBranchScene: (sourceSceneId, choiceCueId, optionId) => {
    let createdSceneId = "";
    set((state) => {
      const project = structuredClone(state.project);
      const chapter = project.chapters[0];
      if (!chapter) {
        return state;
      }
      const sceneNumber = getAllScenes(project).length + 1;
      const sceneId = createId("scene");
      createdSceneId = sceneId;
      const scene: Scene = {
        id: sceneId,
        title: `分支场景 ${String(sceneNumber).padStart(2, "0")}`,
        kind: "dialogue",
        cues: [createCue("background.set", 0), createCue("dialogue.show", 500)],
      };
      chapter.scenes.push(scene);

      const sourceScene = findScene(project, sourceSceneId);
      if (sourceScene) {
        if (choiceCueId && optionId) {
          const choiceCue = sourceScene.cues.find(
            (c): c is import("../project-schema/types").ChoiceShowCue =>
              c.id === choiceCueId && c.type === "choice.show",
          );
          const option = choiceCue?.options.find((opt) => opt.id === optionId);
          if (option) {
            option.targetSceneId = sceneId;
          }
        } else {
          sourceScene.nextSceneId = sceneId;
        }
      }

      const committed = commitProject(state, project, null);
      return {
        ...committed,
        selectedSceneId: sceneId,
        selectedCueId: scene.cues[0]?.id ?? null,
      };
    });
    return createdSceneId;
  },
  addChoiceOption: (sceneId, cueId, label = "新选项", targetSceneId) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      const cue = scene?.cues.find(
        (c): c is import("../project-schema/types").ChoiceShowCue =>
          c.id === cueId && c.type === "choice.show",
      );
      if (!cue) {
        return state;
      }
      cue.options.push({
        id: createId("opt"),
        label,
        targetSceneId: targetSceneId || undefined,
      });
      return commitProject(state, project, `cue:${cueId}:options`);
    }),
  updateChoiceOption: (sceneId, cueId, optionId, patch) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      const cue = scene?.cues.find(
        (c): c is import("../project-schema/types").ChoiceShowCue =>
          c.id === cueId && c.type === "choice.show",
      );
      const option = cue?.options.find((opt) => opt.id === optionId);
      if (!option) {
        return state;
      }
      Object.assign(option, patch);
      return commitProject(state, project, `cue:${cueId}:option:${optionId}`);
    }),
  deleteChoiceOption: (sceneId, cueId, optionId) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      const cue = scene?.cues.find(
        (c): c is import("../project-schema/types").ChoiceShowCue =>
          c.id === cueId && c.type === "choice.show",
      );
      if (!cue || cue.options.length <= 1) {
        return state;
      }
      cue.options = cue.options.filter((opt) => opt.id !== optionId);
      return commitProject(state, project, `cue:${cueId}:options`);
    }),
  reorderChoiceOption: (sceneId, cueId, optionId, direction) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      const cue = scene?.cues.find(
        (c): c is import("../project-schema/types").ChoiceShowCue =>
          c.id === cueId && c.type === "choice.show",
      );
      if (!cue) {
        return state;
      }
      const index = cue.options.findIndex((opt) => opt.id === optionId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= cue.options.length) {
        return state;
      }
      [cue.options[index], cue.options[targetIndex]] = [
        cue.options[targetIndex],
        cue.options[index],
      ];
      return commitProject(state, project, `cue:${cueId}:options`);
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
      const nextAtMs = scene.cues.length * 500;
      const lastCharacterEnter = [...scene.cues]
        .reverse()
        .find(
          (c): c is import("../project-schema/types").CharacterEnterCue =>
            c.type === "character.enter",
        );

      let context: CueCreationContext | undefined;
      if (lastCharacterEnter) {
        const metadata = getCharacterMetadata(lastCharacterEnter.characterRef);
        context = {
          characterRef: lastCharacterEnter.characterRef,
          speaker: metadata.speaker,
          subtitle: metadata.subtitle,
        };
      }

      const cue = createCue(type, nextAtMs, context);
      scene.cues.push(cue);
      const committed = commitProject(state, project, null);
      return { ...committed, selectedCueId: cue.id };
    }),
  addAudioCue: (sceneId, assetRef, channel) =>
    set((state) => {
      const project = structuredClone(state.project);
      const scene = findScene(project, sceneId);
      if (!scene) {
        return state;
      }
      const cue = createCue("audio.play", scene.cues.length * 500);
      if (cue.type !== "audio.play") {
        return state;
      }
      cue.assetRef = assetRef;
      cue.channel = channel;
      cue.loop = channel === "bgm";
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
      Object.assign(cue, patch);
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
