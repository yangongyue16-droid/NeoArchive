import { useEffect, useState } from "react";
import {
  audioChannelOptions,
  fetchCharacterExpressions,
  getCharacterMetadata,
  getKnownCharacterExpressions,
  useAssetCatalog,
  type AssetOption,
  type ExpressionOption,
} from "../assets/catalog";
import { CharacterTransform, Scene, StoryCue, TimeWheelConfig } from "../project-schema/types";
import type { EditableCuePatch } from "../state/editorStore";
import { transitionPresets } from "../transitions/presets";

type CueInspectorProps = {
  cue: StoryCue | null;
  scenes?: Scene[];
  onUpdate: (patch: EditableCuePatch, field: string) => void;
  onOpenLibrary?: (kind: "audio" | "background" | "character") => void;
  onCreateBranchScene?: () => string;
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

function ExpressionPicker({
  characterRef,
  currentAnimation,
  onChange,
}: {
  characterRef: string;
  currentAnimation?: string;
  onChange: (animation: string) => void;
}) {
  const [expressions, setExpressions] = useState<ExpressionOption[]>(() =>
    getKnownCharacterExpressions(characterRef),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCharacterExpressions(characterRef)
      .then((list) => {
        if (active) {
          setExpressions(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [characterRef]);

  const activeValue = (currentAnimation ?? "01").trim();

  return (
    <div className="expression-picker">
      <div className="expression-picker-header">
        <span className="picker-title">表情 / 差分动作（{expressions.length}）</span>
        {loading ? <small className="loading-hint">加载表情中...</small> : null}
      </div>
      <div className="expression-chip-grid">
        {expressions.map((expr) => {
          const isSelected =
            expr.value.toLowerCase() === activeValue.toLowerCase() ||
            expr.rawName.toLowerCase() === activeValue.toLowerCase() ||
            (activeValue.startsWith(expr.value) && expr.value !== "");
          return (
            <button
              className={`expression-chip ${isSelected ? "is-selected" : ""} expression-chip-${expr.category}`}
              key={expr.rawName || expr.value}
              onClick={() => onChange(expr.value)}
              title={expr.rawName}
              type="button"
            >
              {expr.label}
            </button>
          );
        })}
      </div>
      <div className="expression-custom-row">
        <span>自定义动画/动作名：</span>
        <input
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="例如 01, 03_smile, Idle_01"
          value={currentAnimation ?? ""}
        />
      </div>
    </div>
  );
}

export function CueInspector({
  cue,
  onCreateBranchScene,
  onOpenLibrary,
  onUpdate,
  scenes,
}: CueInspectorProps) {
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

  // Find all characters who have entered in the scene containing this cue
  const parentScene = scenes?.find((s) => s.cues.some((c) => c.id === cue.id));
  const enteredCharacters =
    parentScene?.cues.filter(
      (c): c is import("../project-schema/types").CharacterEnterCue => c.type === "character.enter",
    ) ?? [];

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
          {enteredCharacters.length > 0 ? (
            <div className="dialogue-character-sync-bar">
              <span className="sync-bar-label">快捷填入入场角色：</span>
              <div className="sync-chips-list">
                {enteredCharacters.map((char) => {
                  const meta = getCharacterMetadata(char.characterRef);
                  const isCurrent = cue.speaker === meta.speaker;
                  return (
                    <button
                      className={`sync-character-chip ${isCurrent ? "is-active" : ""}`}
                      key={char.id}
                      onClick={() => {
                        onUpdate(
                          { speaker: meta.speaker, subtitle: meta.subtitle },
                          "speaker-sync",
                        );
                      }}
                      title="点击填入该角色的名字与身份"
                      type="button"
                    >
                      <strong>{meta.speaker}</strong>
                      {meta.subtitle ? <small>{meta.subtitle}</small> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
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
          <ExpressionPicker
            characterRef={cue.characterRef}
            currentAnimation={cue.animation}
            onChange={(animation) => onUpdate({ animation }, "animation")}
          />
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

      {cue.type === "character.update" ? (
        <>
          <AssetLibraryTrigger
            label="更新角色"
            onOpen={() => onOpenLibrary?.("character")}
            options={characterOptions}
            value={cue.characterRef}
          />
          <ExpressionPicker
            characterRef={cue.characterRef}
            currentAnimation={cue.animation}
            onChange={(animation) => onUpdate({ animation }, "animation")}
          />
          {cue.transform ? (
            <CharacterPlacement
              onChange={(transform, field) =>
                onUpdate({ transform: { ...cue.transform, ...transform } }, field)
              }
              transform={{ x: 0.5, y: 0.72, scale: 1.05, ...cue.transform }}
            />
          ) : (
            <button
              className="button button-secondary button-small standalone-button"
              onClick={() => onUpdate({ transform: { x: 0.5, y: 0.72, scale: 1.05 } }, "transform")}
              type="button"
            >
              ＋ 添加位置/缩放调整
            </button>
          )}
        </>
      ) : null}

      {cue.type === "character.exit" ? (
        <>
          <AssetLibraryTrigger
            label="退场角色"
            onOpen={() => onOpenLibrary?.("character")}
            options={characterOptions}
            value={cue.characterRef}
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
        <section className="choice-cue-inspector">
          <label>
            <span>选择提示语（可选）</span>
            <input
              onChange={(event) => onUpdate({ prompt: event.currentTarget.value }, "prompt")}
              placeholder="例如：请选择接下来的行动..."
              value={cue.prompt ?? ""}
            />
          </label>
          <div className="choice-options-header">
            <strong>选项列表（{cue.options.length}）</strong>
            <button
              className="button button-secondary button-small"
              onClick={() => {
                const nextOptions = [
                  ...cue.options,
                  {
                    id: `opt-${crypto.randomUUID()}`,
                    label: `选项 ${String.fromCharCode(65 + cue.options.length)}`,
                  },
                ];
                onUpdate({ options: nextOptions }, "options");
              }}
              type="button"
            >
              ＋ 添加选项
            </button>
          </div>
          <div className="choice-options-list">
            {cue.options.map((option, index) => (
              <div className="choice-option-editor-card" key={option.id}>
                <div className="choice-option-card-header">
                  <span className="choice-option-index">
                    选项 {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="choice-option-card-actions">
                    <button
                      aria-label="上移选项"
                      disabled={index === 0}
                      onClick={() => {
                        const nextOptions = [...cue.options];
                        [nextOptions[index - 1], nextOptions[index]] = [
                          nextOptions[index],
                          nextOptions[index - 1],
                        ];
                        onUpdate({ options: nextOptions }, "options");
                      }}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label="下移选项"
                      disabled={index === cue.options.length - 1}
                      onClick={() => {
                        const nextOptions = [...cue.options];
                        [nextOptions[index], nextOptions[index + 1]] = [
                          nextOptions[index + 1],
                          nextOptions[index],
                        ];
                        onUpdate({ options: nextOptions }, "options");
                      }}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label="删除选项"
                      className="danger-text"
                      disabled={cue.options.length <= 1}
                      onClick={() => {
                        const nextOptions = cue.options.filter((o) => o.id !== option.id);
                        onUpdate({ options: nextOptions }, "options");
                      }}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <label>
                  <span>选项文案</span>
                  <input
                    onChange={(event) => {
                      const nextOptions = cue.options.map((o) =>
                        o.id === option.id ? { ...o, label: event.currentTarget.value } : o,
                      );
                      onUpdate({ options: nextOptions }, "option:label");
                    }}
                    placeholder="输入玩家点击的选项文案"
                    value={option.label}
                  />
                </label>
                <label>
                  <span>点击后跳转场景</span>
                  <select
                    onChange={(event) => {
                      const val = event.currentTarget.value;
                      if (val === "__create_new__" && onCreateBranchScene) {
                        const newSceneId = onCreateBranchScene();
                        const nextOptions = cue.options.map((o) =>
                          o.id === option.id ? { ...o, targetSceneId: newSceneId } : o,
                        );
                        onUpdate({ options: nextOptions }, "option:targetSceneId");
                        return;
                      }
                      const nextOptions = cue.options.map((o) =>
                        o.id === option.id
                          ? { ...o, targetSceneId: val === "" ? undefined : val }
                          : o,
                      );
                      onUpdate({ options: nextOptions }, "option:targetSceneId");
                    }}
                    value={option.targetSceneId ?? ""}
                  >
                    <option value="">[ 默认推进（沿用场景出口） ]</option>
                    {scenes?.map((s, sIdx) => (
                      <option key={s.id} value={s.id}>
                        {String(sIdx + 1).padStart(2, "0")}. {s.title} ({s.id})
                      </option>
                    ))}
                    {onCreateBranchScene ? (
                      <option value="__create_new__">＋ 新建并连接到新场景...</option>
                    ) : null}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
