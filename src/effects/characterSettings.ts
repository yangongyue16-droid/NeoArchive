export type HaloGlow = {
  mode: "off" | "follow" | "custom";
  color?: string;
  intensity?: number;
  speed?: number;
};
export type HaloMask = { assetRef: string; invert?: boolean };
export type CharacterEffectKind = "glow" | "glitch" | "dissolve";
export type CharacterEffect = {
  kind: CharacterEffectKind;
  intensity: number;
  speed: number;
  color?: string;
  halo?: HaloGlow;
  haloMask?: HaloMask;
};
export const defaultGlowColor = "#4dd9ff";
export function resolveGlowColor(color?: string | null): string {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
    ? color.toLowerCase()
    : defaultGlowColor;
}
export function glowColorRgb(color?: string | null): [number, number, number] {
  const hex = resolveGlowColor(color);
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
export const characterEffectPresets: Array<{ value: CharacterEffectKind; label: string }> = [
  { value: "glow", label: "轮廓辉光" },
  { value: "glitch", label: "故障失真" },
  { value: "dissolve", label: "噪声消散" },
];
export function normalizeCharacterEffect(value?: CharacterEffect | null): CharacterEffect | null {
  if (!value || !characterEffectPresets.some((preset) => preset.value === value.kind)) return null;
  return {
    kind: value.kind,
    ...(value.halo && ["off", "follow", "custom"].includes(value.halo.mode)
      ? {
          halo: {
            mode: value.halo.mode,
            color: resolveGlowColor(value.halo.color),
            intensity: clampEffect(value.halo.intensity, 0, 2, 1),
            speed: clampEffect(value.halo.speed, 0.25, 3, 1),
          },
        }
      : {}),
    ...(value.haloMask && typeof value.haloMask.assetRef === "string"
      ? { haloMask: { assetRef: value.haloMask.assetRef, invert: value.haloMask.invert === true } }
      : {}),
    ...(value.color !== undefined && value.color !== null
      ? { color: resolveGlowColor(value.color) }
      : {}),
    intensity: Number.isFinite(value.intensity) ? Math.max(0, Math.min(2, value.intensity)) : 1,
    speed: Number.isFinite(value.speed) ? Math.max(0.25, Math.min(3, value.speed)) : 1,
  };
}

function clampEffect(value: number | undefined, min: number, max: number, fallback: number) {
  return value !== undefined && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
export function resolveHaloGlow(value: CharacterEffect): CharacterEffect | null {
  if (value.kind !== "glow" || !value.halo || value.halo.mode === "off") return null;
  if (value.halo.mode === "follow")
    return { kind: "glow", intensity: value.intensity, speed: value.speed, color: value.color };
  return {
    kind: "glow",
    intensity: clampEffect(value.halo.intensity, 0, 2, 1),
    speed: clampEffect(value.halo.speed, 0.25, 3, 1),
    color: resolveGlowColor(value.halo.color),
  };
}
export function isHaloSlot(slot: {
  data: { name: string };
  bone: { data: { name: string }; parent?: unknown };
  getAttachment: () => { name: string } | null;
}): boolean {
  return (
    /halo|光环/i.test(slot.data.name) ||
    /halo|光环/i.test(slot.bone.data.name) ||
    /halo|光环/i.test(slot.getAttachment()?.name ?? "")
  );
}
