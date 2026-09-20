import { LocalAssetPicker } from "../editor/LocalAssetPicker";
import { getUserAsset } from "../assets/userAssets";
import {
  characterEffectPresets,
  normalizeCharacterEffect,
  resolveGlowColor,
  type CharacterEffect,
} from "./characterSettings";
export function CharacterEffectControls({
  effect,
  onChange,
  imageCharacter = false,
}: {
  effect?: CharacterEffect | null;
  imageCharacter?: boolean;
  onChange: (effect: CharacterEffect | null) => void;
}) {
  const value = normalizeCharacterEffect(effect);
  const mask = value?.haloMask ? getUserAsset(value.haloMask.assetRef) : null;
  return (
    <fieldset className="background-effect-controls">
      <legend>角色特效</legend>
      <label>
        <span>效果</span>
        <select
          aria-label="角色效果"
          value={value?.kind ?? "none"}
          onChange={(event) => {
            const preset = characterEffectPresets.find(
              (item) => item.value === event.currentTarget.value,
            );
            onChange(
              preset
                ? {
                    ...value,
                    kind: preset.value,
                    intensity: value?.intensity ?? 1,
                    speed: value?.speed ?? 1,
                    ...(value?.color ? { color: value.color } : {}),
                  }
                : null,
            );
          }}
        >
          <option value="none">无</option>
          {characterEffectPresets.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      {value ? (
        <>
          {value.kind === "glow" ? (
            <label>
              <span>
                辉光颜色<output>{resolveGlowColor(value.color).toUpperCase()}</output>
              </span>
              <input
                type="color"
                aria-label="辉光颜色"
                value={resolveGlowColor(value.color)}
                onChange={(event) => onChange({ ...value, color: event.currentTarget.value })}
              />
            </label>
          ) : null}
          {value.kind === "glow" ? (
            <>
              {imageCharacter ? (
                <fieldset className="halo-mask-controls">
                  <legend>光环蒙版（白色为光环）</legend>
                  <LocalAssetPicker
                    accept="image/*"
                    allowed={["image"]}
                    buttonLabel="导入蒙版"
                    onImported={(assetRef) =>
                      onChange({ ...value, haloMask: { assetRef, invert: false } })
                    }
                  />
                  {value.haloMask ? (
                    <>
                      {mask ? (
                        <img className="halo-mask-preview" src={mask.url} alt="光环蒙版" />
                      ) : null}
                      <span className="halo-mask-name">{mask?.name ?? "蒙版不可用"}</span>
                      <label className="effect-coverage-toggle">
                        <input
                          type="checkbox"
                          checked={value.haloMask.invert === true}
                          onChange={(event) =>
                            onChange({
                              ...value,
                              haloMask: { ...value.haloMask!, invert: event.currentTarget.checked },
                            })
                          }
                        />
                        <span>反转蒙版</span>
                      </label>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          const { haloMask: _mask, ...rest } = value;
                          onChange(rest);
                        }}
                      >
                        移除蒙版
                      </button>
                    </>
                  ) : null}
                </fieldset>
              ) : null}
              <label>
                <span>光环辉光</span>
                <select
                  aria-label="光环辉光"
                  disabled={imageCharacter && !mask}
                  value={value.halo?.mode ?? "off"}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      halo: {
                        ...value.halo,
                        mode: event.currentTarget.value as "off" | "follow" | "custom",
                      },
                    })
                  }
                >
                  <option value="off">关闭</option>
                  <option value="follow">跟随人物</option>
                  <option value="custom">单独调整</option>
                </select>
              </label>
              {value.halo?.mode === "custom" ? (
                <>
                  <label>
                    <span>光环颜色</span>
                    <input
                      aria-label="光环颜色"
                      type="color"
                      value={resolveGlowColor(value.halo.color)}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          halo: { ...value.halo!, color: event.currentTarget.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      光环强度<output>{Math.round((value.halo.intensity ?? 1) * 100)}%</output>
                    </span>
                    <input
                      aria-label="光环强度"
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={value.halo.intensity ?? 1}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          halo: { ...value.halo!, intensity: Number(event.currentTarget.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      光环速度<output>{(value.halo.speed ?? 1).toFixed(2)}×</output>
                    </span>
                    <input
                      aria-label="光环速度"
                      type="range"
                      min={0.25}
                      max={3}
                      step={0.05}
                      value={value.halo.speed ?? 1}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          halo: { ...value.halo!, speed: Number(event.currentTarget.value) },
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          <label>
            <span>
              {value.kind === "dissolve" ? "消散程度" : "强度"}
              <output>
                {Math.round(value.intensity * (value.kind === "dissolve" ? 50 : 100))}%
              </output>
            </span>
            <input
              aria-label="角色特效强度"
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
              速度<output>{value.speed.toFixed(2)}×</output>
            </span>
            <input
              aria-label="角色特效速度"
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
