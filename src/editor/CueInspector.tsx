import { useEffect, useState } from "react";
import { audioChannelOptions, useAssetCatalog, type AssetOption } from "../assets/catalog";
import type { CharacterTransform, StoryCue, TimeWheelConfig } from "../project-schema/types";
import type { EditableCuePatch } from "../state/editorStore";
import { transitionPresets } from "../transitions/presets";

type CueInspectorProps = {
  cue: StoryCue | null;
  onUpdate: (patch: EditableCuePatch, field: string) => void;
  onOpenLibrary?: (kind: "audio" | "background" | "character") => void;
};

type PlacementControlProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
};

type DeferredNumberInputProps = {
  min: number;
  onCommit: (value: number) => void;
  value: number;
};

const defaultTimeWheelConfig: TimeWheelConfig = {
  source: "custom",
  precision: "second",
  showDate: true,
  showWeekday: true,
  showTime: true,
  showTimezone: true,
};

function currentLocalDateTime(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
}

function DeferredNumberInput({ min, onCommit, value }: DeferredNumberInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (rawValue: string) => {
    if (rawValue.trim() === "") {
      setDraft(String(value));
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const nextValue = Math.max(min, Math.round(parsed));
    setDraft(String(nextValue));
    if (nextValue !== value) {
      onCommit(nextValue);
    }
  };

  return (
    <input
      inputMode="numeric"
      min={min}
      onBlur={(event) => commit(event.currentTarget.value)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(String(value));
          event.currentTarget.value = String(value);
          event.currentTarget.blur();
        }
      }}
      step={1}
      type="number"
      value={draft}
    />
  );
}

function PlacementControl({ label, max, min, onChange, step = 0.1, value }: PlacementControlProps) {
  return (
    <label className="placement-control">
      <span className="placement-control-heading">
        <span>{label}</span>
        <span className="placement-value">{value.toFixed(step < 1 ? 1 : 0)}%</span>
      </span>
      <span className="placement-inputs">
        <input
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          step={step}
          type="range"
          value={value}
        />
        <input
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          step={step}
          type="number"
          value={value}
        />
      </span>
    </label>
  );
}

function CharacterPlacement({
  transform,
  onChange,
}: {
  transform: CharacterTransform;
  onChange: (transform: CharacterTransform, field: string) => void;
}) {
  const setValue = (key: keyof CharacterTransform, percentage: number) => {
    onChange({ ...transform, [key]: percentage / 100 }, `transform.${key}`);
  };
  return (
    <section className="placement-controller">
      <div className="placement-controller-heading">
        <div>
          <span className="live-indicator">像素级即时预览</span>
          <h3>立绘控制器</h3>
        </div>
      </div>
      <PlacementControl
        label="X · 水平位置"
        max={200}
        min={-100}
        onChange={(value) => setValue("x", value)}
        value={transform.x * 100}
      />
      <PlacementControl
        label="Y · 垂直位置"
        max={200}
        min={-100}
        onChange={(value) => setValue("y", value)}
        value={transform.y * 100}
      />
      <PlacementControl
        label="Scale · 缩放"
        max={400}
        min={10}
        onChange={(value) => setValue("scale", value)}
        value={transform.scale * 100}
      />
    </section>
  );
}

function AssetLibraryTrigger({
  label,
  onOpen,
  options,
  value,
}: {
  label: string;
  onOpen: () => void;
  options: readonly AssetOption[];
  value: string;
}) {
  const current = options.find((option) => option.value === value);

  return (
    <div className="asset-library-trigger">
      <span>
        {label}
        <small className="asset-count"> {options.length}</small>
      </span>
      <button onClick={onOpen} type="button">
        <strong>{current?.label ?? value}</strong>
        <code>{value}</code>
        <span>点击浏览素材库</span>
      </button>
    </div>
  );
}

export function CueInspector({ cue, onOpenLibrary, onUpdate }: CueInspectorProps) {
  const { audioOptions, backgroundOptions, characterOptions } = useAssetCatalog();
  if (!cue) {
    return <p className="empty-inspector">选择一条剧本行后在这里编辑。</p>;
  }

  const timeWheel =
    cue.type === "transition.play"
      ? { ...defaultTimeWheelConfig, ...cue.timeWheel }
      : defaultTimeWheelConfig;
  const updateTimeWheel = (patch: Partial<TimeWheelConfig>, field: string) => {
    onUpdate({ timeWheel: { ...timeWheel, ...patch } }, `timeWheel.${field}`);
  };

  return (
    <>
      <div className="panel-heading inspector-heading">
        <div>
          <p className="eyebrow">INSPECTOR · LIVE</p>
          <h2>{cue.type}</h2>
        </div>
      </div>
      {cue.type === "dialogue.show" ? (
        <>
          <div className="field-row">
            <label>
              <span>说话人</span>
              <input
                onChange={(event) => onUpdate({ speaker: event.currentTarget.value }, "speaker")}
                value={cue.speaker}
              />
            </label>
            <label>
              <span>身份/学校</span>
              <input
                onChange={(event) => onUpdate({ subtitle: event.currentTarget.value }, "subtitle")}
                value={cue.subtitle ?? ""}
              />
            </label>
          </div>
          <label>
            <span>对白文本 · 每个字即时刷新</span>
            <textarea
              onChange={(event) => onUpdate({ text: event.currentTarget.value }, "text")}
              rows={7}
              value={cue.text}
            />
          </label>
          <div className="field-row">
            <label>
              <span>打字速度（字/秒）</span>
              <input
                min={1}
                onChange={(event) =>
                  onUpdate(
                    { typingCps: Math.max(1, Number(event.currentTarget.value)) },
                    "typingCps",
                  )
                }
                type="number"
                value={cue.typingCps}
              />
            </label>
            <label className="checkbox-field">
              <input
                checked={cue.waitForAdvance}
                onChange={(event) =>
                  onUpdate({ waitForAdvance: event.currentTarget.checked }, "waitForAdvance")
                }
                type="checkbox"
              />
              <span>等待玩家继续</span>
            </label>
          </div>
        </>
      ) : null}

      {cue.type === "background.set" ? (
        <>
          <AssetLibraryTrigger
            label="背景素材"
            onOpen={() => onOpenLibrary?.("background")}
            options={backgroundOptions}
            value={cue.assetRef}
          />
          <label>
            <span>淡入时间（ms）</span>
            <input
              min={0}
              onChange={(event) =>
                onUpdate(
                  { transitionMs: Math.max(0, Number(event.currentTarget.value)) },
                  "transitionMs",
                )
              }
              type="number"
              value={cue.transitionMs ?? 0}
            />
          </label>
        </>
      ) : null}

      {cue.type === "character.enter" ? (
        <>
          <AssetLibraryTrigger
            label="角色素材"
            onOpen={() => onOpenLibrary?.("character")}
            options={characterOptions}
            value={cue.characterRef}
          />
          <label>
            <span>Spine 动画</span>
            <input
              onChange={(event) => onUpdate({ animation: event.currentTarget.value }, "animation")}
              value={cue.animation}
            />
          </label>
          <label>
            <span>入场前等待（ms）</span>
            <DeferredNumberInput
              min={0}
              onCommit={(delayMs) => onUpdate({ delayMs }, "delayMs")}
              value={cue.delayMs ?? 0}
            />
          </label>
          <label>
            <span>入场动画时长（ms）</span>
            <DeferredNumberInput
              min={0}
              onCommit={(enterDurationMs) => onUpdate({ enterDurationMs }, "enterDurationMs")}
              value={cue.enterDurationMs ?? 420}
            />
          </label>
          <CharacterPlacement
            onChange={(transform, field) => onUpdate({ transform }, field)}
            transform={cue.transform}
          />
        </>
      ) : null}

      {cue.type === "audio.play" ? (
        <>
          <AssetLibraryTrigger
            label="音频素材"
            onOpen={() => onOpenLibrary?.("audio")}
            options={audioOptions}
            value={cue.assetRef}
          />
          <div className="field-row">
            <label>
              <span>通道</span>
              <select
                onChange={(event) =>
                  onUpdate(
                    { channel: event.currentTarget.value as "bgm" | "voice" | "sfx" },
                    "channel",
                  )
                }
                value={cue.channel}
              >
                {audioChannelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>音量（0-100）</span>
              <input
                max={100}
                min={0}
                onChange={(event) =>
                  onUpdate({ volume: Number(event.currentTarget.value) / 100 }, "volume")
                }
                type="number"
                value={Math.round((cue.volume ?? 1) * 100)}
              />
            </label>
          </div>
          <label className="checkbox-field standalone-checkbox">
            <input
              checked={cue.loop ?? false}
              onChange={(event) => onUpdate({ loop: event.currentTarget.checked }, "loop")}
              type="checkbox"
            />
            <span>循环播放</span>
          </label>
        </>
      ) : null}

      {cue.type === "wait" ? (
        <>
          <label>
            <span>等待时间（ms）</span>
            <input
              min={0}
              onChange={(event) =>
                onUpdate(
                  { durationMs: Math.max(0, Number(event.currentTarget.value)) },
                  "durationMs",
                )
              }
              type="number"
              value={cue.durationMs ?? 0}
            />
          </label>
          <label className="checkbox-field standalone-checkbox">
            <input
              checked={cue.waitForAdvance ?? false}
              onChange={(event) =>
                onUpdate({ waitForAdvance: event.currentTarget.checked }, "waitForAdvance")
              }
              type="checkbox"
            />
            <span>改为等待玩家点击</span>
          </label>
        </>
      ) : null}

      {cue.type === "transition.play" ? (
        <>
          <label>
            <span>过场预设</span>
            <select
              onChange={(event) => {
                const preset = event.currentTarget
                  .value as (typeof transitionPresets)[number]["value"];
                onUpdate(
                  {
                    preset,
                    durationMs:
                      preset === "chromatic-slice"
                        ? Math.max(1800, cue.durationMs)
                        : cue.durationMs,
                    timeWheel:
                      preset === "chromatic-slice" && !cue.timeWheel
                        ? {
                            ...defaultTimeWheelConfig,
                            customDateTime: currentLocalDateTime(),
                          }
                        : cue.timeWheel,
                  },
                  "preset",
                );
              }}
              value={cue.preset}
            >
              {transitionPresets.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <p className="transition-description">
            {transitionPresets.find((preset) => preset.value === cue.preset)?.description}
          </p>
          {cue.preset === "chromatic-slice" ? (
            <section className="time-wheel-settings">
              <h3>剧情时间</h3>
              <label>
                <span>时间来源</span>
                <select
                  onChange={(event) => {
                    const source = event.currentTarget.value as TimeWheelConfig["source"];
                    updateTimeWheel(
                      {
                        source,
                        customDateTime:
                          source === "custom"
                            ? timeWheel.customDateTime || currentLocalDateTime()
                            : timeWheel.customDateTime,
                      },
                      "source",
                    );
                  }}
                  value={timeWheel.source}
                >
                  <option value="custom">剧情自定义时间</option>
                  <option value="system">触发时系统时间</option>
                </select>
              </label>
              {timeWheel.source === "custom" ? (
                <label>
                  <span>剧情日期与时间</span>
                  <input
                    onChange={(event) =>
                      updateTimeWheel(
                        { customDateTime: event.currentTarget.value },
                        "customDateTime",
                      )
                    }
                    step={1}
                    type="datetime-local"
                    value={timeWheel.customDateTime ?? currentLocalDateTime()}
                  />
                </label>
              ) : null}
              <label>
                <span>时间精度</span>
                <select
                  onChange={(event) => {
                    const precision = event.currentTarget.value as TimeWheelConfig["precision"];
                    updateTimeWheel(
                      precision === "day"
                        ? { precision, showDate: true, showTime: false }
                        : { precision },
                      "precision",
                    );
                  }}
                  value={timeWheel.precision}
                >
                  <option value="day">日期</option>
                  <option value="hour">小时</option>
                  <option value="minute">分钟</option>
                  <option value="second">秒</option>
                </select>
              </label>
              <div className="time-wheel-display-options" role="group" aria-label="轮盘显示内容">
                {[
                  ["showDate", "日期"],
                  ["showWeekday", "星期"],
                  ["showTime", "时间"],
                  ["showTimezone", "时区"],
                ].map(([field, label]) => {
                  const key = field as keyof Pick<
                    TimeWheelConfig,
                    "showDate" | "showWeekday" | "showTime" | "showTimezone"
                  >;
                  return (
                    <label className="checkbox-field" key={field}>
                      <input
                        checked={timeWheel[key]}
                        disabled={
                          (key === "showTime" && timeWheel.precision === "day") ||
                          (key === "showTimezone" && !timeWheel.showTime)
                        }
                        onChange={(event) =>
                          updateTimeWheel({ [key]: event.currentTarget.checked }, key)
                        }
                        type="checkbox"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}
          <div className="field-row">
            <label>
              <span>动画时长（ms）</span>
              <DeferredNumberInput
                min={cue.preset === "chromatic-slice" ? 1200 : 240}
                onCommit={(durationMs) => onUpdate({ durationMs }, "durationMs")}
                value={cue.durationMs}
              />
            </label>
            <label>
              <span>完全遮挡（ms）</span>
              <DeferredNumberInput
                min={0}
                onCommit={(holdMs) => onUpdate({ holdMs }, "holdMs")}
                value={cue.holdMs ?? 0}
              />
            </label>
          </div>
          <label>
            <span>强度（10-200%）</span>
            <input
              max={200}
              min={10}
              onChange={(event) =>
                onUpdate({ intensity: Number(event.currentTarget.value) / 100 }, "intensity")
              }
              type="range"
              value={Math.round((cue.intensity ?? 1) * 100)}
            />
          </label>
          <button
            className="button button-secondary"
            onClick={() => onUpdate({ intensity: cue.intensity ?? 1 }, "replay")}
            type="button"
          >
            重新播放当前过场
          </button>
        </>
      ) : null}

      {cue.type === "choice.show" ? (
        <div className="inspector-note">
          <strong>{cue.prompt ?? "选择"}</strong>
          <span>{cue.options.length} 个选项；分支编辑将在流程模式接入。</span>
        </div>
      ) : null}
    </>
  );
}
