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
  waitForMediaEnd?: boolean;
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

export type AdvanceWhen = {
  text?: boolean;
  voice?: boolean;
  backgroundVideo?: boolean;
};

export type DialogueShowCue = BaseCue & {
  type: "dialogue.show";
  speaker: string;
  subtitle?: string;
  text: string;
  /** 已废弃：全局打字速度见 StoryProject.dialogueTypingCps。 */
  typingCps?: number;
  waitForAdvance: boolean;
  holdAfterMs?: number;
  /** 有配音时，配音播完后再停留的毫秒数。0 = 播完即切；缺省用全局默认（500）。 */
  voiceHoldMs?: number;
  advanceWhen?: AdvanceWhen;
  voiceAssetRef?: string;
  voiceStartMs?: number;
  /** 配音播放到该时间点截断（剪掉结尾多余声音）；缺省播到音频全长。 */
  voiceEndMs?: number;
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
  /** 首幕入场过渡：播放开始（从入口进入）时先播放。 */
  entryTransition?: SceneExitTransition;
  /** 末幕收尾过渡：剧情播完后渐隐结束。 */
  endingTransition?: SceneExitTransition;
  cues: StoryCue[];
};

export function resolveDialogueHoldMs(
  cue: { text: string; holdAfterMs?: number },
  scene?: { autoAdvanceMs?: number } | null,
  project?: { dialogueHoldMs?: number } | null,
): number {
  if (cue.holdAfterMs !== undefined) {
    return Math.max(0, cue.holdAfterMs);
  }
  if (scene?.autoAdvanceMs !== undefined) {
    return Math.max(0, scene.autoAdvanceMs);
  }
  if (project?.dialogueHoldMs !== undefined) {
    return Math.max(0, project.dialogueHoldMs);
  }
  return 2000;
}

/** 全局对白打字速度（字/秒），强制所有对白生效，缺省 8。 */
export function resolveDialogueTypingCps(project?: { dialogueTypingCps?: number } | null): number {
  const value = project?.dialogueTypingCps;
  return value !== undefined ? Math.max(1, value) : 8;
}

/** 有配音句子：配音播完后再停留的毫秒数。0 = 播完即切；缺省 1000。
 *  优先级：单句 voiceHoldMs > 工程全局 voiceHoldMs > 默认 1000。 */
export function resolveVoiceHoldMs(
  cue: { voiceHoldMs?: number },
  project?: { voiceHoldMs?: number } | null,
): number {
  if (cue.voiceHoldMs !== undefined) {
    return Math.max(0, cue.voiceHoldMs);
  }
  if (project?.voiceHoldMs !== undefined) {
    return Math.max(0, project.voiceHoldMs);
  }
  return 1000;
}

/** 开场画面淡入（毫秒）：播放成品从头开始时第一张背景的缓入时长，
 *  避免第一帧图片生硬闪现。缺省 1200；显式设为 0 则关闭（用 cue 自己的过渡）。 */
export function resolveOpeningFadeMs(project?: { openingFadeMs?: number } | null): number {
  return project?.openingFadeMs !== undefined ? Math.max(0, project.openingFadeMs) : 1200;
}

export function resolveAdvanceWhen(cue: {
  voiceAssetRef?: string;
  advanceWhen?: AdvanceWhen;
}): Required<AdvanceWhen> {
  return {
    text: cue.advanceWhen?.text ?? true,
    voice: cue.advanceWhen?.voice ?? Boolean(cue.voiceAssetRef),
    backgroundVideo: cue.advanceWhen?.backgroundVideo ?? false,
  };
}

export function gatesSatisfied(
  required: Required<AdvanceWhen>,
  ready: Required<AdvanceWhen>,
): boolean {
  return (
    (!required.text || ready.text) &&
    (!required.voice || ready.voice) &&
    (!required.backgroundVideo || ready.backgroundVideo)
  );
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
  /** 全局默认停留（无配音句子播完停留的毫秒数），缺省 2000。单句可用 holdAfterMs 覆盖。 */
  dialogueHoldMs?: number;
  /** 全局配音播完停留（有配音句子播完停留的毫秒数），缺省 1000。单句可用 voiceHoldMs 覆盖。 */
  voiceHoldMs?: number;
  /** 开场画面淡入（毫秒），缺省 1200；0 = 关闭开场缓入。 */
  openingFadeMs?: number;
  /** 全局对白打字速度（字/秒），强制所有对白生效，缺省 8。 */
  dialogueTypingCps?: number;
  dialogueFontRef?: string;
  stage?: StageSettings;
  dialogueBox?: DialogueBoxSettings;
  chapters: Chapter[];
};

export function getAllScenes(project: StoryProject): Scene[] {
  return project.chapters.flatMap((chapter) => chapter.scenes);
}

/** 工程内第一个非空背景图的 assetRef（用于工程卡片缩略图）；无则 null。 */
export function firstBackgroundAssetRef(project: StoryProject): string | null {
  for (const scene of getAllScenes(project)) {
    for (const cue of scene.cues) {
      if (cue.type === "background.set" && cue.assetRef !== "") {
        return cue.assetRef;
      }
    }
  }
  return null;
}

export function findScene(project: StoryProject, sceneId: string): Scene | undefined {
  return getAllScenes(project).find((scene) => scene.id === sceneId);
}
