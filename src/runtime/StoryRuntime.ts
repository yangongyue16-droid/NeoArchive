import {
  findScene,
  type CharacterTransform,
  type Scene,
  type StoryCue,
  type StageTransitionPreset,
  type StoryProject,
  type TimeWheelConfig,
} from "../project-schema/types";

export type RuntimeCharacter = {
  characterRef: string;
  animation: string;
  entryCueId: string;
  entryInstanceId: number;
  enterDurationMs: number;
  transform: CharacterTransform;
};

export type RuntimeDialogue = {
  cueId: string;
  speaker: string;
  subtitle?: string;
  text: string;
  typingCps: number;
};

export type RuntimeAudio = {
  assetRef: string;
  channel: "bgm" | "voice" | "sfx";
  loop: boolean;
  volume: number;
  startMs?: number;
  cueId?: string;
};

function withoutDialogueVoice(state: PlaybackState): PlaybackState {
  if (!state.audio.voice) {
    return state;
  }
  const audio = { ...state.audio };
  delete audio.voice;
  return { ...state, audio };
}

export type RuntimeTransition = {
  instanceId: number;
  preset: StageTransitionPreset;
  durationMs: number;
  holdMs: number;
  intensity: number;
  timeWheel?: TimeWheelConfig;
};

export type PlaybackStatus = "idle" | "playing" | "waiting_user" | "paused" | "completed" | "error";

export type PlaybackState = {
  status: PlaybackStatus;
  sceneId: string | null;
  sceneTitle: string | null;
  currentCueIndex: number;
  backgroundRef: string | null;
  backgroundCueId: string | null;
  backgroundInstanceId: number;
  backgroundTransitionMs: number;
  characters: RuntimeCharacter[];
  dialogue: RuntimeDialogue | null;
  choicePrompt: string | null;
  choices: Array<{ id: string; label: string; targetSceneId?: string }>;
  audio: Partial<Record<RuntimeAudio["channel"], RuntimeAudio>>;
  transition: RuntimeTransition | null;
  error: string | null;
};

export type SaveSnapshot = {
  version: 1;
  projectId: string;
  createdAt: string;
  state: PlaybackState;
};

const initialState: PlaybackState = {
  status: "idle",
  sceneId: null,
  sceneTitle: null,
  currentCueIndex: 0,
  backgroundRef: null,
  backgroundCueId: null,
  backgroundInstanceId: 0,
  backgroundTransitionMs: 0,
  characters: [],
  dialogue: null,
  choicePrompt: null,
  choices: [],
  audio: {},
  transition: null,
  error: null,
};

export class StoryRuntime {
  private listeners = new Set<() => void>();
  private project: StoryProject;
  private state: PlaybackState = initialState;
  private statusBeforePause: PlaybackStatus = "playing";
  private transitionSequence = 0;
  private backgroundSequence = 0;
  private characterEntrySequence = 0;
  private cueTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStageAnimation: {
    kind: "background" | "character";
    instanceId: number;
    sceneId: string;
    nextCueIndex: number;
  } | null = null;
  private pendingSceneTransition: { instanceId: number; targetSceneId: string } | null = null;

  constructor(project: StoryProject) {
    this.project = project;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): PlaybackState => this.state;

  readonly notifyBackgroundTransitionCompleted = (instanceId: number): void => {
    this.continueAfterStageAnimation("background", instanceId);
  };

  readonly notifyCharacterEnterCompleted = (instanceId: number): void => {
    this.continueAfterStageAnimation("character", instanceId);
  };

  readonly notifyTransitionCovered = (instanceId: number): void => {
    const pending = this.pendingSceneTransition;
    if (!pending || pending.instanceId !== instanceId) {
      return;
    }
    const transition = this.state.transition;
    if (!transition || transition.instanceId !== instanceId) {
      return;
    }
    this.enterScene(pending.targetSceneId, transition);
  };

  readonly notifyTransitionCompleted = (instanceId: number): void => {
    const pending = this.pendingSceneTransition;
    if (
      !pending ||
      pending.instanceId !== instanceId ||
      this.state.sceneId !== pending.targetSceneId ||
      this.state.transition?.instanceId !== instanceId
    ) {
      return;
    }
    const targetScene = findScene(this.project, pending.targetSceneId);
    this.pendingSceneTransition = null;
    if (!targetScene) {
      this.commit({
        ...this.state,
        status: "error",
        error: `Scene not found: ${pending.targetSceneId}`,
      });
      return;
    }
    this.state = { ...this.state, transition: null };
    this.process(targetScene, this.state.currentCueIndex);
  };

  replaceProject(project: StoryProject): void {
    this.clearSceneTransitionTimer();
    this.project = project;
  }

  createSaveSnapshot(): SaveSnapshot {
    return {
      version: 1,
      projectId: this.project.projectId,
      createdAt: new Date().toISOString(),
      state: structuredClone(this.state),
    };
  }

  restoreSaveSnapshot(snapshot: SaveSnapshot): void {
    if (snapshot.version !== 1 || snapshot.projectId !== this.project.projectId) {
      throw new Error("存档与当前工程不兼容。");
    }
    if (snapshot.state.sceneId && !findScene(this.project, snapshot.state.sceneId)) {
      throw new Error("存档引用的场景不存在。");
    }
    this.clearSceneTransitionTimer();
    this.commit({ ...initialState, ...structuredClone(snapshot.state) });
  }

  start(sceneId = this.project.entrySceneId): void {
    this.clearSceneTransitionTimer();
    this.enterScene(sceneId);
  }

  private enterScene(sceneId: string, preservedTransition?: RuntimeTransition): void {
    const scene = findScene(this.project, sceneId);
    if (!scene) {
      this.commit({ ...initialState, status: "error", error: `Scene not found: ${sceneId}` });
      return;
    }

    this.state = {
      ...initialState,
      status: "playing",
      sceneId: scene.id,
      sceneTitle: scene.title,
      transition: preservedTransition ?? null,
    };
    if (preservedTransition) {
      this.prepareSceneBehindTransition(scene, preservedTransition);
      return;
    }
    this.process(scene, 0);
  }

  preview(sceneId: string, cueId?: string, forceReplay = false): void {
    this.clearSceneTransitionTimer();
    const scene = findScene(this.project, sceneId);
    if (!scene) {
      this.commit({ ...initialState, status: "error", error: `Scene not found: ${sceneId}` });
      return;
    }

    const cues = scene.cues;
    const targetIndex = cueId ? cues.findIndex((cue) => cue.id === cueId) : 0;
    const finalIndex = targetIndex >= 0 ? targetIndex : 0;
    const previousState = this.state.sceneId === scene.id ? this.state : null;
    const previousCharacters = new Map(
      previousState?.characters.map((character) => [character.entryCueId, character]) ?? [],
    );
    let nextState: PlaybackState = {
      ...initialState,
      status: "playing",
      sceneId: scene.id,
      sceneTitle: scene.title,
    };

    for (let index = 0; index <= finalIndex && index < cues.length; index += 1) {
      if (cues[index].type === "transition.play" && index !== finalIndex) {
        continue;
      }
      const cue = cues[index];
      if (cue.type === "background.set") {
        const canReuseBackground =
          !(forceReplay && index === finalIndex) &&
          previousState?.backgroundCueId === cue.id &&
          previousState.backgroundRef === cue.assetRef;
        if (canReuseBackground) {
          nextState = {
            ...nextState,
            backgroundRef: cue.assetRef,
            backgroundCueId: cue.id,
            backgroundInstanceId: previousState.backgroundInstanceId,
            backgroundTransitionMs: previousState.backgroundTransitionMs,
          };
        } else {
          nextState = this.applyCue(nextState, {
            ...cue,
            transitionMs: index === finalIndex ? cue.transitionMs : 0,
          });
        }
      } else if (cue.type === "character.enter") {
        const previousCharacter = previousCharacters.get(cue.id);
        const canReuseCharacter =
          !(forceReplay && index === finalIndex) &&
          previousCharacter?.characterRef === cue.characterRef;
        if (canReuseCharacter) {
          const otherCharacters = nextState.characters.filter(
            ({ characterRef }) => characterRef !== cue.characterRef,
          );
          nextState = {
            ...nextState,
            characters: [
              ...otherCharacters,
              {
                ...previousCharacter,
                animation: cue.animation,
                transform: cue.transform,
              },
            ],
          };
        } else {
          nextState = this.applyCue(nextState, {
            ...cue,
            enterDurationMs: index === finalIndex ? cue.enterDurationMs : 0,
          });
        }
      } else if (cue.type === "dialogue.show") {
        nextState = this.applyCue(nextState, { ...cue, voiceAssetRef: undefined });
      } else {
        nextState = this.applyCue(nextState, cue);
      }
      nextState = { ...nextState, currentCueIndex: index + 1 };
    }

    this.commit({
      ...nextState,
      status: nextState.dialogue || nextState.choices.length > 0 ? "waiting_user" : "paused",
    });
  }

  advance(): void {
    if (this.state.status !== "waiting_user" || this.state.choices.length > 0) {
      return;
    }

    const scene = this.currentScene();
    if (!scene) {
      return;
    }

    this.state = { ...withoutDialogueVoice(this.state), status: "playing", dialogue: null };
    this.process(scene, this.state.currentCueIndex);
  }

  choose(optionId: string): void {
    if (this.state.status !== "waiting_user") {
      return;
    }

    const option = this.state.choices.find((candidate) => candidate.id === optionId);
    if (!option) {
      return;
    }

    if (option.targetSceneId) {
      this.start(option.targetSceneId);
      return;
    }

    this.commit({
      ...this.state,
      status: "completed",
      choices: [],
      choicePrompt: null,
    });
  }

  pause(): void {
    if (this.state.status === "playing" || this.state.status === "waiting_user") {
      this.statusBeforePause = this.state.status;
      this.commit({ ...this.state, status: "paused" });
    }
  }

  resume(): void {
    if (this.state.status === "paused") {
      this.commit({ ...this.state, status: this.statusBeforePause });
    }
  }

  private currentScene(): Scene | undefined {
    return this.state.sceneId ? findScene(this.project, this.state.sceneId) : undefined;
  }

  private process(scene: Scene, startIndex: number): void {
    const cues = scene.cues;
    let nextState: PlaybackState = { ...this.state, status: "playing" };

    for (let index = startIndex; index < cues.length; index += 1) {
      const cue = cues[index];

      if (cue.type === "character.enter" && (cue.delayMs ?? 400) > 0) {
        this.commit({ ...nextState, status: "playing", currentCueIndex: index });
        this.cueTimer = setTimeout(() => {
          this.cueTimer = null;
          this.state = this.applyCue(this.state, cue);
          this.state = { ...this.state, currentCueIndex: index + 1 };
          const enterDurationMs = cue.enterDurationMs ?? 420;
          if (enterDurationMs > 0) {
            const character = this.state.characters.find(
              ({ characterRef }) => characterRef === cue.characterRef,
            );
            if (character) {
              this.pendingStageAnimation = {
                kind: "character",
                instanceId: character.entryInstanceId,
                sceneId: scene.id,
                nextCueIndex: index + 1,
              };
              this.commit(this.state);
            }
            return;
          }
          this.process(scene, index + 1);
        }, cue.delayMs ?? 400);
        return;
      }

      nextState = this.applyCue(nextState, cue);
      nextState = { ...nextState, currentCueIndex: index + 1 };

      const blockingDurationMs =
        cue.type === "background.set"
          ? (cue.transitionMs ?? 0)
          : cue.type === "wait" && !cue.waitForAdvance
            ? (cue.durationMs ?? 0)
            : cue.type === "character.enter"
              ? (cue.enterDurationMs ?? 420)
              : 0;
      if (blockingDurationMs > 0) {
        this.commit({ ...nextState, status: "playing" });
        const instanceId =
          cue.type === "background.set"
            ? nextState.backgroundInstanceId
            : cue.type === "character.enter"
              ? (nextState.characters.find(({ characterRef }) => characterRef === cue.characterRef)
                  ?.entryInstanceId ?? -1)
              : -1;
        if (cue.type === "background.set" || cue.type === "character.enter") {
          this.pendingStageAnimation = {
            kind: cue.type === "background.set" ? "background" : "character",
            instanceId,
            sceneId: scene.id,
            nextCueIndex: index + 1,
          };
          return;
        }
        this.cueTimer = setTimeout(() => {
          this.cueTimer = null;
          this.process(scene, index + 1);
        }, blockingDurationMs);
        return;
      }

      const isOutgoingSceneTransition =
        cue.type === "transition.play" && index === cues.length - 1 && !!scene.nextSceneId;
      if (isOutgoingSceneTransition) {
        const outgoingTransition = nextState.transition;
        if (!outgoingTransition) {
          continue;
        }
        const targetSceneId = scene.nextSceneId;
        if (!targetSceneId) {
          continue;
        }
        this.pendingSceneTransition = {
          instanceId: outgoingTransition.instanceId,
          targetSceneId,
        };
        this.commit({
          ...withoutDialogueVoice(nextState),
          status: "playing",
          dialogue: null,
        });
        return;
      }

      if (
        cue.type === "choice.show" ||
        (cue.type === "dialogue.show" && cue.waitForAdvance) ||
        (cue.type === "wait" && cue.waitForAdvance)
      ) {
        this.commit({ ...nextState, status: "waiting_user" });
        return;
      }
    }

    if (scene.nextSceneId) {
      const exit = scene.exitTransition;
      if (exit && exit.preset !== "none") {
        this.transitionSequence += 1;
        const outgoingTransition: RuntimeTransition = {
          instanceId: this.transitionSequence,
          preset: exit.preset,
          durationMs: exit.durationMs,
          holdMs: exit.holdMs ?? 0,
          intensity: exit.intensity ?? 1,
        };
        this.pendingSceneTransition = {
          instanceId: outgoingTransition.instanceId,
          targetSceneId: scene.nextSceneId,
        };
        this.commit({
          ...withoutDialogueVoice(nextState),
          status: "playing",
          dialogue: null,
          transition: outgoingTransition,
        });
        return;
      }
      this.start(scene.nextSceneId);
      return;
    }

    this.commit({ ...nextState, status: "completed" });
  }

  private prepareSceneBehindTransition(scene: Scene, preservedTransition: RuntimeTransition): void {
    const cues = scene.cues;
    let nextState: PlaybackState = { ...this.state, status: "playing" };
    let resumeIndex = 0;

    while (cues[resumeIndex]?.type === "transition.play") {
      resumeIndex += 1;
    }

    const firstVisibleCue = cues[resumeIndex];
    if (firstVisibleCue?.type === "background.set") {
      nextState = this.applyCue(nextState, { ...firstVisibleCue, transitionMs: 0 });
      resumeIndex += 1;
    }

    this.commit({
      ...withoutDialogueVoice(nextState),
      status: "playing",
      currentCueIndex: resumeIndex,
      dialogue: null,
      choices: [],
      choicePrompt: null,
      transition: preservedTransition,
    });
  }

  private applyCue(state: PlaybackState, cue: StoryCue): PlaybackState {
    switch (cue.type) {
      case "background.set":
        this.backgroundSequence += 1;
        return withoutDialogueVoice({
          ...state,
          backgroundRef: cue.assetRef,
          backgroundCueId: cue.id,
          backgroundInstanceId: this.backgroundSequence,
          backgroundTransitionMs: cue.transitionMs ?? 0,
        });
      case "character.enter": {
        this.characterEntrySequence += 1;
        const otherCharacters = state.characters.filter(
          ({ characterRef }) => characterRef !== cue.characterRef,
        );
        return {
          ...state,
          characters: [
            ...otherCharacters,
            {
              characterRef: cue.characterRef,
              animation: cue.animation,
              entryCueId: cue.id,
              entryInstanceId: this.characterEntrySequence,
              enterDurationMs: cue.enterDurationMs ?? 420,
              transform: cue.transform,
            },
          ],
        };
      }
      case "character.update":
        return {
          ...state,
          characters: state.characters.map((character) =>
            character.characterRef === cue.characterRef
              ? {
                  ...character,
                  animation: cue.animation ?? character.animation,
                  transform: { ...character.transform, ...cue.transform },
                }
              : character,
          ),
        };
      case "character.exit":
        return {
          ...state,
          characters: state.characters.filter(
            ({ characterRef }) => characterRef !== cue.characterRef,
          ),
        };
      case "dialogue.show": {
        const nextState = withoutDialogueVoice({
          ...state,
          dialogue: {
            cueId: cue.id,
            speaker: cue.speaker,
            subtitle: cue.subtitle,
            text: cue.text,
            typingCps: cue.typingCps,
          },
        });
        if (!cue.voiceAssetRef) {
          return nextState;
        }
        return {
          ...nextState,
          audio: {
            ...nextState.audio,
            voice: {
              assetRef: cue.voiceAssetRef,
              channel: "voice",
              loop: false,
              volume: 1,
              startMs: cue.voiceStartMs ?? 0,
              cueId: cue.id,
            },
          },
        };
      }
      case "choice.show":
        return withoutDialogueVoice({
          ...state,
          dialogue: null,
          choicePrompt: cue.prompt ?? null,
          choices: cue.options,
        });
      case "audio.play":
        return {
          ...state,
          audio: {
            ...state.audio,
            [cue.channel]: {
              assetRef: cue.assetRef,
              channel: cue.channel,
              loop: cue.loop ?? false,
              volume: cue.volume ?? 1,
            },
          },
        };
      case "audio.stop": {
        const audio = { ...state.audio };
        delete audio[cue.channel];
        return { ...state, audio };
      }
      case "transition.play":
        this.transitionSequence += 1;
        return {
          ...state,
          transition: {
            instanceId: this.transitionSequence,
            preset: cue.preset,
            durationMs: cue.durationMs,
            holdMs: cue.holdMs ?? 0,
            intensity: cue.intensity ?? 1,
            timeWheel: cue.timeWheel ? structuredClone(cue.timeWheel) : undefined,
          },
        };
      case "wait":
        return state;
    }
  }

  private commit(nextState: PlaybackState): void {
    this.state = nextState;
    this.listeners.forEach((listener) => listener());
  }

  private continueAfterStageAnimation(kind: "background" | "character", instanceId: number): void {
    const pending = this.pendingStageAnimation;
    if (!pending || pending.kind !== kind || pending.instanceId !== instanceId) {
      return;
    }
    const scene = findScene(this.project, pending.sceneId);
    this.pendingStageAnimation = null;
    if (!scene || this.state.sceneId !== scene.id) {
      return;
    }
    this.process(scene, pending.nextCueIndex);
  }

  private clearSceneTransitionTimer(): void {
    this.pendingSceneTransition = null;
    this.pendingStageAnimation = null;
    if (this.cueTimer !== null) {
      clearTimeout(this.cueTimer);
      this.cueTimer = null;
    }
  }
}
