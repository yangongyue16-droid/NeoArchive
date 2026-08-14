export type SceneKind = "dialogue" | "direction" | "choice";

export type CharacterTransform = {
  x: number;
  y: number;
  scale: number;
};

type BaseCue = {
  id: string;
  atMs: number;
};

export type BackgroundSetCue = BaseCue & {
  type: "background.set";
  assetRef: string;
  transitionMs?: number;
};

export type CharacterEnterCue = BaseCue & {
  type: "character.enter";
  characterRef: string;
  animation: string;
  delayMs?: number;
  enterDurationMs?: number;
  transform: CharacterTransform;
};

export type CharacterUpdateCue = BaseCue & {
  type: "character.update";
  characterRef: string;
  animation?: string;
  transform?: Partial<CharacterTransform>;
};

export type CharacterExitCue = BaseCue & {
  type: "character.exit";
  characterRef: string;
};

export type DialogueShowCue = BaseCue & {
  type: "dialogue.show";
  speaker: string;
  subtitle?: string;
  text: string;
  typingCps: number;
  waitForAdvance: boolean;
  holdAfterMs?: number;
  voiceAssetRef?: string;
  voiceStartMs?: number;
};

export type AudioPlayCue = BaseCue & {
  type: "audio.play";
  assetRef: string;
  channel: "bgm" | "voice" | "sfx";
  loop?: boolean;
  volume?: number;
};

export type AudioStopCue = BaseCue & {
  type: "audio.stop";
  channel: "bgm" | "voice" | "sfx";
};

export type ChoiceOption = {
  id: string;
  label: string;
  targetSceneId?: string;
};

export type ChoiceShowCue = BaseCue & {
  type: "choice.show";
  prompt?: string;
  options: ChoiceOption[];
};

export type WaitCue = BaseCue & {
  type: "wait";
  durationMs?: number;
  waitForAdvance?: boolean;
};

export type StageTransitionPreset =
  | "archive-shutter"
  | "chromatic-slice"
  | "fade-black"
  | "fade-white"
  | "halo-iris"
  | "none";

export type TimeWheelConfig = {
  source: "system" | "custom";
  customDateTime?: string;
  precision: "day" | "hour" | "minute" | "second";
  showDate: boolean;
  showWeekday: boolean;
  showTime: boolean;
  showTimezone: boolean;
};

export type TransitionPlayCue = BaseCue & {
  type: "transition.play";
  preset: StageTransitionPreset;
  durationMs: number;
  holdMs?: number;
  intensity?: number;
  timeWheel?: TimeWheelConfig;
};

export type StoryCue =
  | AudioPlayCue
  | AudioStopCue
  | BackgroundSetCue
  | CharacterEnterCue
  | CharacterExitCue
  | CharacterUpdateCue
  | ChoiceShowCue
  | DialogueShowCue
  | TransitionPlayCue
  | WaitCue;

export type SceneExitTransition = {
  preset: StageTransitionPreset;
  durationMs: number;
  holdMs?: number;
  intensity?: number;
};

export type Scene = {
  id: string;
  title: string;
  kind: SceneKind;
  autoAdvanceMs?: number;
  nextSceneId?: string;
  exitTransition?: SceneExitTransition;
  cues: StoryCue[];
};

export function resolveDialogueHoldMs(
  cue: { text: string; holdAfterMs?: number },
  scene?: { autoAdvanceMs?: number } | null,
): number {
  if (cue.holdAfterMs !== undefined) {
    return Math.max(0, cue.holdAfterMs);
  }
  if (scene?.autoAdvanceMs !== undefined) {
    return Math.max(0, scene.autoAdvanceMs);
  }
  return Math.max(850, cue.text.length * 42);
}

export type Chapter = {
  id: string;
  title: string;
  scenes: Scene[];
};

export type StageAspectPreset = "16:9" | "21:9" | "4:3" | "3:2" | "1:1" | "9:16" | "custom";

export type BackgroundFit = "contain" | "cover" | "fill";

export type StageSettings = {
  aspect: StageAspectPreset;
  width: number;
  height: number;
  backgroundFit?: BackgroundFit;
};

export type DialogueRegionStyle = {
  fontSize: number;
  x: number;
  y: number;
};

export type DialogueRuleStyle = {
  x: number;
  y: number;
  width: number;
};

export type DialogueBoxSettings = {
  heightPercent: number;
  speaker: DialogueRegionStyle;
  subtitle: DialogueRegionStyle;
  text: DialogueRegionStyle;
  rule: DialogueRuleStyle;
};

export type StoryProject = {
  schemaVersion: 1;
  projectId: string;
  title: string;
  entrySceneId: string;
  createdAt: string;
  updatedAt: string;
  dialogueFontRef?: string;
  stage?: StageSettings;
  dialogueBox?: DialogueBoxSettings;
  chapters: Chapter[];
};

export function getAllScenes(project: StoryProject): Scene[] {
  return project.chapters.flatMap((chapter) => chapter.scenes);
}

export function findScene(project: StoryProject, sceneId: string): Scene | undefined {
  return getAllScenes(project).find((scene) => scene.id === sceneId);
}
