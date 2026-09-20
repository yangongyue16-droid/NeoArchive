export type BackgroundEffectKind = "glitch" | "vhs" | "droplets" | "frost" | "shatter";

export type BackgroundEffect = {
  kind: BackgroundEffectKind;
  intensity: number;
  speed: number;
  coverDialogue?: boolean;
};

export const effectPresets: Array<{ value: BackgroundEffectKind; label: string }> = [
  { value: "glitch", label: "Glitch · 故障" },
  { value: "vhs", label: "VHS · 录像带" },
  { value: "droplets", label: "Droplets · 雨滴" },
  { value: "frost", label: "Frost · 结霜" },
  { value: "shatter", label: "Shatter · 破碎" },
];

export function normalizeBackgroundEffect(
  value?: BackgroundEffect | null,
): BackgroundEffect | null {
  if (!value || !effectPresets.some((preset) => preset.value === value.kind)) return null;
  return {
    kind: value.kind,
    ...(value.coverDialogue === true ? { coverDialogue: true } : {}),
    intensity: Number.isFinite(value.intensity) ? Math.min(2, Math.max(0, value.intensity)) : 1,
    speed: Number.isFinite(value.speed) ? Math.min(3, Math.max(0.25, value.speed)) : 1,
  };
}
