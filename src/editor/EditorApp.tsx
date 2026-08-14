import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BackendApiError, openProject, saveProject, type ProjectDocument } from "../api/client";
import { useBackendHealth } from "../api/useBackendHealth";
import { builtInDialogueFont } from "../assets/catalog";
import { getUserAsset } from "../assets/userAssets";
import { useDialogueFont } from "../assets/useDialogueFont";
import { LocalAssetPicker } from "./LocalAssetPicker";
import { downloadProject, parseProjectFile } from "../project-schema/projectFile";
import {
  backgroundFitOptions,
  normalizeDialogueBox,
  normalizeStageSettings,
  stagePresets,
  stageSummary,
} from "../project-schema/stage";
import type { BackgroundFit } from "../project-schema/types";
import type { DialogueRegionStyle } from "../project-schema/types";
import { findScene, getAllScenes } from "../project-schema/types";
import { StoryStage } from "../player/StoryStage";
import { useStoryRuntime } from "../runtime/useStoryRuntime";
import { useEditorStore } from "../state/editorStore";
import { transitionPresets } from "../transitions/presets";
import { CueInspector } from "./CueInspector";
import { ScriptTimeline } from "./ScriptTimeline";

type ThemeMode = "day" | "night";
type WorkMode = "script" | "stage";

export function EditorApp() {
  const project = useEditorStore((state) => state.project);
  const selectedSceneId = useEditorStore((state) => state.selectedSceneId);
  const selectedCueId = useEditorStore((state) => state.selectedCueId);
  const dirty = useEditorStore((state) => state.dirty);
  const pastCount = useEditorStore((state) => state.past.length);
  const futureCount = useEditorStore((state) => state.future.length);
  const selectScene = useEditorStore((state) => state.selectScene);
  const selectCue = useEditorStore((state) => state.selectCue);
  const addScene = useEditorStore((state) => state.addScene);
  const renameScene = useEditorStore((state) => state.renameScene);
  const setSceneAutoAdvance = useEditorStore((state) => state.setSceneAutoAdvance);
  const setSceneExit = useEditorStore((state) => state.setSceneExit);
  const deleteScene = useEditorStore((state) => state.deleteScene);
  const addCue = useEditorStore((state) => state.addCue);
  const updateCue = useEditorStore((state) => state.updateCue);
  const deleteCue = useEditorStore((state) => state.deleteCue);
  const duplicateCue = useEditorStore((state) => state.duplicateCue);
  const moveCue = useEditorStore((state) => state.moveCue);
  const reorderCue = useEditorStore((state) => state.reorderCue);
  const loadProject = useEditorStore((state) => state.loadProject);
  const setDialogueFont = useEditorStore((state) => state.setDialogueFont);
  const setStageSettings = useEditorStore((state) => state.setStageSettings);
  const setDialogueBox = useEditorStore((state) => state.setDialogueBox);
  const markSaved = useEditorStore((state) => state.markSaved);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const { data: backendHealth } = useBackendHealth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backendDocumentRef = useRef<Pick<ProjectDocument, "project" | "revision"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [workMode, setWorkMode] = useState<WorkMode>("script");
  const [exclusiveFullscreen, setExclusiveFullscreen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    window.localStorage.getItem("neoarchive-theme") === "day" ? "day" : "night",
  );
  const activeScene = findScene(project, selectedSceneId) ?? getAllScenes(project)[0];
  const selectedCue =
    activeScene.cues.find((cue) => cue.id === selectedCueId) ?? activeScene.cues[0] ?? null;
  const { playback, runtime } = useStoryRuntime(project, activeScene.id, selectedCue?.id);
  const customFont = project.dialogueFontRef ? getUserAsset(project.dialogueFontRef) : null;
  const stage = normalizeStageSettings(project.stage);
  const dialogueBox = normalizeDialogueBox(project.dialogueBox);
  useDialogueFont(project.dialogueFontRef);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("neoarchive-theme", theme);
  }, [theme]);

  const exitExclusiveFullscreen = useCallback(async () => {
    try {
      if ("__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_exclusive_fullscreen", { fullscreen: false });
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } finally {
      setExclusiveFullscreen(false);
    }
  }, []);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }
    let disposed = false;
    const syncFullscreen = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const current = await getCurrentWindow().isFullscreen();
      if (!disposed) {
        setExclusiveFullscreen(current);
      }
    };
    void syncFullscreen();
    const timer = window.setInterval(() => {
      void syncFullscreen();
    }, 500);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void exitExclusiveFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [exitExclusiveFullscreen]);

  const handleOpenFile = async (file: File) => {
    try {
      const importedProject = parseProjectFile(await file.text());
      backendDocumentRef.current = null;
      loadProject(importedProject);
      setNotice(`已打开 ${file.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "工程打开失败");
    }
  };

  const handleOpenFromBackend = async () => {
    setProjectBusy(true);
    try {
      const document = await openProject(project.projectId);
      backendDocumentRef.current = document;
      loadProject(document.project);
      const warnings = document.diagnostics.filter((item) => item.severity === "warning").length;
      setNotice(warnings > 0 ? `工程已打开 · ${warnings} 条提醒` : "已从 Python 工程库打开");
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 404) {
        setNotice("Python 工程库中还没有当前工程，请先保存或从文件导入");
      } else {
        setNotice(error instanceof Error ? error.message : "Python 工程打开失败");
      }
    } finally {
      setProjectBusy(false);
    }
  };

  const handleSave = async () => {
    setProjectBusy(true);
    try {
      let revision =
        backendDocumentRef.current?.project.projectId === project.projectId
          ? backendDocumentRef.current.revision
          : undefined;
      if (!revision) {
        try {
          revision = (await openProject(project.projectId)).revision;
        } catch (error) {
          if (!(error instanceof BackendApiError && error.status === 404)) {
            throw error;
          }
        }
      }

      const document = await saveProject(project, revision);
      backendDocumentRef.current = document;
      markSaved();
      const warnings = document.diagnostics.filter((item) => item.severity === "warning").length;
      setNotice(warnings > 0 ? `已保存 · ${warnings} 条提醒` : "已保存到 Python 工程库");
    } catch (error) {
      if (error instanceof BackendApiError) {
        setNotice(error.message);
      } else {
        downloadProject(project);
        markSaved();
        setNotice("Python 服务不可用，已下载 JSON 备份");
      }
    } finally {
      setProjectBusy(false);
    }
  };

  return (
    <main className={`app-shell work-mode-${workMode}`}>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <p className="eyebrow">GALGAME EDITOR</p>
          <h1>NeoArchive</h1>
        </div>
        <nav className="workspace-tabs" aria-label="编辑工作区">
          <button
            className={workMode === "script" ? "is-active" : ""}
            onClick={() => setWorkMode("script")}
            type="button"
          >
            幕前
          </button>
          <button
            className={workMode === "stage" ? "is-active" : ""}
            onClick={() => setWorkMode("stage")}
            type="button"
          >
            幕后
          </button>
          <button disabled type="button">
            流程
          </button>
          <button disabled type="button">
            素材
          </button>
          <button disabled type="button">
            发布
          </button>
        </nav>
        <div className="topbar-actions">
          <button
            className="history-button"
            disabled={pastCount === 0}
            onClick={undo}
            type="button"
          >
            撤销
          </button>
          <button
            className="history-button"
            disabled={futureCount === 0}
            onClick={redo}
            type="button"
          >
            重做
          </button>
          <button
            className="history-button"
            disabled={projectBusy || !backendHealth}
            onClick={() => void handleOpenFromBackend()}
            type="button"
          >
            打开
          </button>
          <button
            className="history-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            导入
          </button>
          <button
            className="history-button"
            disabled={projectBusy}
            onClick={() => void handleSave()}
            type="button"
          >
            保存
          </button>
          <input
            accept=".json,.neoarchive"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                void handleOpenFile(file);
              }
              event.currentTarget.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
          <div className="theme-switch" role="group" aria-label="外观模式">
            <button
              aria-pressed={theme === "day"}
              className={theme === "day" ? "is-active" : ""}
              onClick={() => setTheme("day")}
              type="button"
            >
              日间
            </button>
            <button
              aria-pressed={theme === "night"}
              className={theme === "night" ? "is-active" : ""}
              onClick={() => setTheme("night")}
              type="button"
            >
              夜间
            </button>
          </div>
          {exclusiveFullscreen ? (
            <button
              className="history-button"
              onClick={() => void exitExclusiveFullscreen()}
              type="button"
            >
              退出全屏
            </button>
          ) : null}
          <span className={`status-pill ${backendHealth ? "is-online" : ""}`}>
            {dirty
              ? "自动草稿 · 未保存"
              : backendHealth
                ? `Python · ${backendHealth.database}`
                : "Web 原型"}
          </span>
          <button
            className="button button-primary"
            onClick={() => {
              window.location.hash = "#/player";
            }}
            type="button"
          >
            播放成品
          </button>
        </div>
      </header>

      {notice ? (
        <button className="editor-notice" onClick={() => setNotice(null)} type="button">
          {notice}
        </button>
      ) : null}

      <section className="workspace">
        <aside className="panel scene-panel" aria-label="场景列表">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{project.chapters[0]?.title.toUpperCase()}</p>
              <h2>场景管理</h2>
            </div>
            <button className="icon-button" onClick={addScene} type="button" aria-label="添加场景">
              ＋
            </button>
          </div>
          <div className="scene-editor">
            <label>
              <span>场景名称</span>
              <input
                onChange={(event) => renameScene(activeScene.id, event.currentTarget.value)}
                value={activeScene.title}
              />
            </label>
            <label>
              <span>AUTO 每句停留（秒）</span>
              <input
                min={0.25}
                onChange={(event) => {
                  const rawValue = event.currentTarget.value;
                  if (rawValue === "") {
                    setSceneAutoAdvance(activeScene.id, undefined);
                    return;
                  }
                  const seconds = Number(rawValue);
                  setSceneAutoAdvance(
                    activeScene.id,
                    Number.isFinite(seconds)
                      ? Math.max(250, Math.round(seconds * 1000))
                      : undefined,
                  );
                }}
                placeholder="自适应"
                step={0.25}
                type="number"
                value={
                  activeScene.autoAdvanceMs === undefined ? "" : activeScene.autoAdvanceMs / 1000
                }
              />
              <small>留空则按文字长度自动计算</small>
            </label>
            <label>
              <span>下一场</span>
              <select
                onChange={(event) =>
                  setSceneExit(activeScene.id, {
                    nextSceneId: event.currentTarget.value || null,
                  })
                }
                value={activeScene.nextSceneId ?? ""}
              >
                <option value="">结束</option>
                {getAllScenes(project)
                  .filter((scene) => scene.id !== activeScene.id)
                  .map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.title}
                    </option>
                  ))}
              </select>
            </label>
            {activeScene.nextSceneId ? (
              <label>
                <span>切到下一场</span>
                <select
                  onChange={(event) => {
                    const preset = event.currentTarget
                      .value as (typeof transitionPresets)[number]["value"];
                    setSceneExit(activeScene.id, {
                      exitTransition: {
                        preset,
                        durationMs:
                          preset === "none" ? 0 : preset === "chromatic-slice" ? 1800 : 900,
                        holdMs: preset === "none" ? 0 : 120,
                        intensity: 1,
                      },
                    });
                  }}
                  value={activeScene.exitTransition?.preset ?? "none"}
                >
                  {transitionPresets.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {workMode === "script" ? (
              <button
                className="danger-button"
                disabled={getAllScenes(project).length <= 1}
                onClick={() => deleteScene(activeScene.id)}
                type="button"
              >
                删除当前场景
              </button>
            ) : (
              <>
                <label>
                  <span>剧情字体</span>
                  <select
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value !== "__custom__") {
                        setDialogueFont(value);
                      }
                    }}
                    value={
                      !project.dialogueFontRef ||
                      project.dialogueFontRef === builtInDialogueFont.value
                        ? builtInDialogueFont.value
                        : "__custom__"
                    }
                  >
                    <option value={builtInDialogueFont.value}>{builtInDialogueFont.label}</option>
                    {customFont ? (
                      <option value="__custom__">本地字体 · {customFont.name}</option>
                    ) : null}
                  </select>
                </label>
                <LocalAssetPicker
                  accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                  allowed={["font"]}
                  buttonLabel="选择本地字体"
                  onImported={(assetRef) => setDialogueFont(assetRef)}
                />
                <label>
                  <span>画面比例</span>
                  <select
                    onChange={(event) =>
                      setStageSettings({
                        aspect: event.currentTarget.value as (typeof stagePresets)[number]["value"],
                      })
                    }
                    value={stage.aspect}
                  >
                    {stagePresets.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-row stage-size-fields">
                  <label>
                    <span>宽</span>
                    <input
                      min={320}
                      onChange={(event) =>
                        setStageSettings({
                          aspect: "custom",
                          width: Number(event.currentTarget.value),
                        })
                      }
                      type="number"
                      value={stage.width}
                    />
                  </label>
                  <label>
                    <span>高</span>
                    <input
                      min={240}
                      onChange={(event) =>
                        setStageSettings({
                          aspect: "custom",
                          height: Number(event.currentTarget.value),
                        })
                      }
                      type="number"
                      value={stage.height}
                    />
                  </label>
                </div>
                <label>
                  <span>背景填充</span>
                  <select
                    onChange={(event) =>
                      setStageSettings({
                        backgroundFit: event.currentTarget.value as BackgroundFit,
                      })
                    }
                    value={stage.backgroundFit ?? "contain"}
                  >
                    {backgroundFitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          <nav className="scene-list">
            {getAllScenes(project).map((scene, index) => (
              <button
                className={`scene-item ${scene.id === activeScene.id ? "is-active" : ""}`}
                key={scene.id}
                onClick={() => selectScene(scene.id)}
                type="button"
              >
                <span className="scene-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="scene-copy">
                  <strong>{scene.title}</strong>
                  <small>{scene.cues.length} cues</small>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="stage-column">
          <div className="stage-toolbar">
            <span>
              {stageSummary(stage)} · {playback.status} · {selectedCue?.type ?? "empty"}
            </span>
            <div className="toolbar-group" aria-label="幕后工具">
              <span className="live-preview-badge">LIVE</span>
              <button
                onClick={() => runtime.preview(activeScene.id, selectedCue?.id, true)}
                type="button"
              >
                刷新当前行
              </button>
              <button onClick={() => runtime.start(activeScene.id)} type="button">
                播放场景
              </button>
            </div>
          </div>

          <div className="stage-fit">
            <StoryStage
              instantText
              layoutEdit={workMode === "stage"}
              stage={stage}
              dialogueBox={dialogueBox}
              onDialogueBoxChange={workMode === "stage" ? setDialogueBox : undefined}
              onBackgroundTransitionComplete={runtime.notifyBackgroundTransitionCompleted}
              onCharacterEnterComplete={runtime.notifyCharacterEnterCompleted}
              onChoose={(optionId) => runtime.choose(optionId)}
              onTransitionComplete={runtime.notifyTransitionCompleted}
              onTransitionCover={runtime.notifyTransitionCovered}
              playback={playback}
            />
          </div>

          <ScriptTimeline
            onAdd={(type) => addCue(activeScene.id, type)}
            onDelete={(cueId) => deleteCue(activeScene.id, cueId)}
            onDuplicate={(cueId) => duplicateCue(activeScene.id, cueId)}
            onMove={(cueId, direction) => moveCue(activeScene.id, cueId, direction)}
            onReorder={(cueId, targetCueId, edge) =>
              reorderCue(activeScene.id, cueId, targetCueId, edge)
            }
            onSelect={selectCue}
            scene={activeScene}
            selectedCueId={selectedCue?.id ?? null}
            onUpdateCue={(cueId, patch, field) => updateCue(activeScene.id, cueId, patch, field)}
          />
        </section>

        <aside className="panel inspector" aria-label="属性面板">
          {workMode === "stage" ? (
            <>
              <div className="panel-heading inspector-heading">
                <div>
                  <p className="eyebrow">BACKSTAGE · DIALOGUE</p>
                  <h2>对话框</h2>
                </div>
              </div>
              <label>
                <span>对话框高度（%）</span>
                <input
                  max={80}
                  min={18}
                  onChange={(event) =>
                    setDialogueBox({ heightPercent: Number(event.currentTarget.value) })
                  }
                  type="range"
                  value={dialogueBox.heightPercent}
                />
                <small>{dialogueBox.heightPercent}%</small>
              </label>
              <div className="dialogue-region-editor">
                <strong>分割线</strong>
                <div className="field-row stage-size-fields">
                  <label>
                    <span>X</span>
                    <input
                      max={100}
                      min={0}
                      onChange={(event) =>
                        setDialogueBox({
                          rule: { ...dialogueBox.rule, x: Number(event.currentTarget.value) },
                        })
                      }
                      step={0.1}
                      type="number"
                      value={dialogueBox.rule.x}
                    />
                  </label>
                  <label>
                    <span>Y</span>
                    <input
                      max={100}
                      min={0}
                      onChange={(event) =>
                        setDialogueBox({
                          rule: { ...dialogueBox.rule, y: Number(event.currentTarget.value) },
                        })
                      }
                      step={0.1}
                      type="number"
                      value={dialogueBox.rule.y}
                    />
                  </label>
                </div>
                <label>
                  <span>长度</span>
                  <input
                    max={100}
                    min={4}
                    onChange={(event) =>
                      setDialogueBox({
                        rule: { ...dialogueBox.rule, width: Number(event.currentTarget.value) },
                      })
                    }
                    step={0.1}
                    type="number"
                    value={dialogueBox.rule.width}
                  />
                </label>
              </div>
              <button
                className="button button-secondary"
                onClick={() => {
                  setDialogueBox(dialogueBox);
                  setNotice("已将当前对话框样式应用到全部场景");
                }}
                type="button"
              >
                全部应用
              </button>
              {(
                [
                  ["speaker", "说话人"],
                  ["subtitle", "身份"],
                  ["text", "正文"],
                ] as const
              ).map(([key, label]) => {
                const region = dialogueBox[key];
                const updateRegion = (patch: Partial<DialogueRegionStyle>) =>
                  setDialogueBox({ [key]: { ...region, ...patch } });
                return (
                  <div className="dialogue-region-editor" key={key}>
                    <strong>{label}</strong>
                    <label>
                      <span>字号</span>
                      <input
                        max={120}
                        min={8}
                        onChange={(event) =>
                          updateRegion({ fontSize: Number(event.currentTarget.value) })
                        }
                        step={0.1}
                        type="number"
                        value={region.fontSize}
                      />
                    </label>
                    <div className="field-row stage-size-fields">
                      <label>
                        <span>X</span>
                        <input
                          max={100}
                          min={0}
                          onChange={(event) =>
                            updateRegion({ x: Number(event.currentTarget.value) })
                          }
                          step={0.1}
                          type="number"
                          value={region.x}
                        />
                      </label>
                      <label>
                        <span>Y</span>
                        <input
                          max={100}
                          min={0}
                          onChange={(event) =>
                            updateRegion({ y: Number(event.currentTarget.value) })
                          }
                          step={0.1}
                          type="number"
                          value={region.y}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <CueInspector
              cue={selectedCue}
              onUpdate={(patch, field) => {
                if (selectedCue) {
                  updateCue(activeScene.id, selectedCue.id, patch, field);
                }
              }}
            />
          )}
        </aside>
      </section>
    </main>
  );
}
