import { effectPresets, normalizeBackgroundEffect, type BackgroundEffect } from "./settings";

export function BackgroundEffectControls({
  effect,
  onChange,
}: {
  effect?: BackgroundEffect | null;
  onChange: (effect: BackgroundEffect | null) => void;
}) {
  const value = normalizeBackgroundEffect(effect);
  return (
    <fieldset className="background-effect-controls">
      <legend>背景特效</legend>
      <label>
        <span>效果</span>
        <select
          value={value?.kind ?? "none"}
          onChange={(event) => {
            const preset = effectPresets.find((item) => item.value === event.currentTarget.value);
            onChange(
              preset
                ? {
                    kind: preset.value,
                    intensity: value?.intensity ?? 1,
                    speed: value?.speed ?? 1,
                    coverDialogue: value?.coverDialogue ?? false,
                  }
                : null,
            );
          }}
        >
          <option value="none">无</option>
          {effectPresets.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      {value ? (
        <>
          <label className="effect-coverage-toggle">
            <input
              type="checkbox"
              checked={value.coverDialogue === true}
              onChange={(event) =>
                onChange({ ...value, coverDialogue: event.currentTarget.checked })
              }
            />
            <span>覆盖对白文字</span>
          </label>
          <label>
            <span>
              强度 <output>{Math.round(value.intensity * 100)}%</output>
            </span>
            <input
              aria-label="特效强度"
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={value.intensity}
              onChange={(event) =>
                onChange({ ...value, intensity: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            <span>
              速度 <output>{value.speed.toFixed(2)}×</output>
            </span>
            <input
              aria-label="特效速度"
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={value.speed}
              onChange={(event) => onChange({ ...value, speed: Number(event.currentTarget.value) })}
            />
          </label>
        </>
      ) : null}
    </fieldset>
  );
}
