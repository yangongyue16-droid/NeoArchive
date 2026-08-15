import type { CSSProperties } from "react";
import type {
  BackgroundFit,
  DialogueBoxSettings,
  DialogueRegionStyle,
  DialogueRuleStyle,
  StageAspectPreset,
  StageSettings,
} from "./types";

export const defaultStageSettings: StageSettings = {
  aspect: "16:9",
  width: 1920,
  height: 1080,
  backgroundFit: "cover",
};

export const backgroundFitOptions: Array<{ value: BackgroundFit; label: string }> = [
  { value: "cover", label: "铺满画面 · 居中裁剪" },
  { value: "contain", label: "完整显示 · 不裁切" },
  { value: "fill", label: "拉伸填满" },
];

export const stagePresets: Array<{
  value: StageAspectPreset;
  label: string;
  width: number;
  height: number;
}> = [
  { value: "16:9", label: "16:9 · 横屏", width: 1920, height: 1080 },
  { value: "21:9", label: "21:9 · 超宽", width: 2560, height: 1080 },
  { value: "4:3", label: "4:3 · 传统", width: 1440, height: 1080 },
  { value: "3:2", label: "3:2", width: 1620, height: 1080 },
  { value: "1:1", label: "1:1 · 方形", width: 1080, height: 1080 },
  { value: "9:16", label: "9:16 · 竖屏", width: 1080, height: 1920 },
  { value: "custom", label: "自定义", width: 1920, height: 1080 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampDecimal(value: number, min: number, max: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(value * factor) / factor));
}

export function normalizeStageSettings(settings?: Partial<StageSettings> | null): StageSettings {
  const aspect = settings?.aspect ?? defaultStageSettings.aspect;
  const preset = stagePresets.find((item) => item.value === aspect);
  const backgroundFit = settings?.backgroundFit ?? defaultStageSettings.backgroundFit;
  if (!preset || aspect === "custom") {
    return {
      aspect: "custom",
      width: clamp(settings?.width ?? defaultStageSettings.width, 320, 7680),
      height: clamp(settings?.height ?? defaultStageSettings.height, 240, 4320),
      backgroundFit,
    };
  }
  return { aspect, width: preset.width, height: preset.height, backgroundFit };
}

export function stageCssVars(settings?: Partial<StageSettings> | null): CSSProperties {
  const stage = normalizeStageSettings(settings);
  return {
    "--stage-w": String(stage.width),
    "--stage-h": String(stage.height),
    "--bg-fit": stage.backgroundFit ?? "cover",
  } as CSSProperties;
}

export function stageSummary(settings?: Partial<StageSettings> | null): string {
  const stage = normalizeStageSettings(settings);
  return `${stage.width}×${stage.height} · ${stage.aspect === "custom" ? "自定义" : stage.aspect}`;
}

export const defaultDialogueBox: DialogueBoxSettings = {
  heightPercent: 51,
  speaker: { fontSize: 48, x: 9.7, y: 41.68 },
  subtitle: { fontSize: 40, x: 18.61, y: 39.97 },
  text: { fontSize: 33, x: 9.64, y: 58.67 },
  rule: { x: 9.54, y: 55.17, width: 72 },
};

function normalizeRegion(
  region: Partial<DialogueRegionStyle> | undefined,
  fallback: DialogueRegionStyle,
): DialogueRegionStyle {
  return {
    fontSize: clampDecimal(region?.fontSize ?? fallback.fontSize, 8, 120, 1),
    x: clampDecimal(region?.x ?? fallback.x, 0, 100, 2),
    y: clampDecimal(region?.y ?? fallback.y, 0, 100, 2),
  };
}

type DialogueBoxPatch = Partial<
  Omit<DialogueBoxSettings, "speaker" | "subtitle" | "text" | "rule">
> & {
  speaker?: Partial<DialogueRegionStyle>;
  subtitle?: Partial<DialogueRegionStyle>;
  text?: Partial<DialogueRegionStyle>;
  rule?: Partial<DialogueRuleStyle>;
};

export function normalizeDialogueBox(settings?: DialogueBoxPatch | null): DialogueBoxSettings {
  return {
    heightPercent: clamp(settings?.heightPercent ?? defaultDialogueBox.heightPercent, 18, 80),
    speaker: normalizeRegion(settings?.speaker, defaultDialogueBox.speaker),
    subtitle: normalizeRegion(settings?.subtitle, defaultDialogueBox.subtitle),
    text: normalizeRegion(settings?.text, defaultDialogueBox.text),
    rule: {
      x: clampDecimal(settings?.rule?.x ?? defaultDialogueBox.rule.x, 0, 100, 2),
      y: clampDecimal(settings?.rule?.y ?? defaultDialogueBox.rule.y, 0, 100, 2),
      width: clampDecimal(settings?.rule?.width ?? defaultDialogueBox.rule.width, 4, 100, 2),
    },
  };
}

export function dialogueBoxCssVars(settings?: DialogueBoxPatch | null): CSSProperties {
  const box = normalizeDialogueBox(settings);
  return {
    "--dlg-h": `${box.heightPercent}`,
    "--dlg-speaker-size": `${box.speaker.fontSize}`,
    "--dlg-speaker-x": `${box.speaker.x}`,
    "--dlg-speaker-y": `${box.speaker.y}`,
    "--dlg-subtitle-size": `${box.subtitle.fontSize}`,
    "--dlg-subtitle-x": `${box.subtitle.x}`,
    "--dlg-subtitle-y": `${box.subtitle.y}`,
    "--dlg-text-size": `${box.text.fontSize}`,
    "--dlg-text-x": `${box.text.x}`,
    "--dlg-text-y": `${box.text.y}`,
    "--dlg-rule-x": `${box.rule.x}`,
    "--dlg-rule-y": `${box.rule.y}`,
    "--dlg-rule-w": `${box.rule.width}`,
  } as CSSProperties;
}
