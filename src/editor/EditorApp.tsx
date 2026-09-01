import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BackendApiError, openProject, saveProject, type ProjectDocument } from "../api/client";
import { useBackendHealth } from "../api/useBackendHealth";
import { builtInDialogueFont } from "../assets/catalog";
import { getUserAsset } from "../assets/userAssets";
import { useDialogueFont } from "../assets/useDialogueFont";
import { LocalAssetPicker } from "./LocalAssetPicker";
import { downloadProject, parseProjectFile } from "../project-schema/projectFile";
import { sampleProject } from "../project-schema/sampleProject";
import {
  backgroundFitOptions,
  normalizeDialogueBox,
  normalizeStageSettings,
  stagePresets,
  stageSummary,
} from "../project-schema/stage";
import type { BackgroundFit } from "../project-schema/types";
import type { DialogueRegionStyle } from "../project-schema/types";
import type { SceneExitTransition } from "../project-schema/types";
import { findScene, getAllScenes, resolveDialogueHoldMs } from "../project-schema/types";
import { StoryStage } from "../player/StoryStage";
import { useAutoAdvance } from "../runtime/useAutoAdvance";
import { useStoryRuntime } from "../runtime/useStoryRuntime";
import { useEditorStore } from "../state/editorStore";
import { transitionPresets } from "../transitions/presets";
import { CueInspector } from "./CueInspector";
import { ScriptTimeline } from "./ScriptTimeline";
import {
  addBookmark,
  deleteBookmark,
  listBookmarks,
  renameBookmark,
  type Bookmark,
} from "./bookmarks";
import {
  createNewProject,
  deleteProject,
  listProjects,
  openProjectDraft,
  renameProject,
  type ProjectMeta,
} from "../project-schema/projects";

type ThemeMode = "day" | "night";
type WorkMode = "script" | "stage";

type DeferredNumberInputProps = {
  allowEmpty?: boolean;
  max?: number;
  min?: number;
  onCommit: (value: number | null) => void;
  placeholder?: string;
  step?: number;
  value: number | null;
};

/**
 * 数字输入：先写在本地草稿，失焦 / 回车才提交。
 * 解决「改 48 → 50 删不掉、全选输入被 min/max/步进钳制」的问题。
 * allowEmpty 为 true 时清空输入会提交 null（用于清除可选字段）。
 */
function DeferredNumberInput({
  allowEmpty = false,
  max,
  min,
  onCommit,
  placeholder,
  step = 1,
  value,
}: DeferredNumberInputProps) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);

  const commit = () => {
    const rawValue = draft.trim();
    if (rawValue === "") {
      if (allowEmpty) {
        onCommit(null);
        return;
      }
      setDraft(value === null ? "" : String(value));
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setDraft(value === null ? "" : String(value));
      return;
    }
    const decimals = step < 1 ? 1 : 0;
    let nextValue = Number(parsed.toFixed(decimals));
    if (min !== undefined) {
      nextValue = Math.max(min, nextValue);
    }
    if (max !== undefined) {
      nextValue = Math.min(max, nextValue);
    }
    setDraft(String(nextValue));
    onCommit(nextValue);
  };

  return (
    <input
      inputMode="decimal"
      max={max}
      min={min}
      onBlur={commit}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value === null ? "" : String(value));
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      step={step}
      type="number"
      value={draft}
    />
  );
}

function defaultDurationForPreset(preset: SceneExitTransition["preset"]): number {
  return preset === "none" ? 0 : preset === "chromatic-slice" ? 1800 : 900;
}

function SceneTransitionEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: SceneExitTransition | null;
  onChange: (transition: SceneExitTransition) => void;
}) {
  const preset = value?.preset ?? "none";
  const durationMs = value?.durationMs ?? defaultDurationForPreset(preset);
  const holdMs = value?.holdMs ?? 0;
  const disabled = preset === "none";
  return (
    <>
      <label>
        <span>{label}</span>
        <select
          onChange={(event) => {
            const nextPreset = event.currentTarget
              .value as (typeof transitionPresets)[number]["value"];
            onChange({
              preset: nextPreset,
              durationMs: defaultDurationForPreset(nextPreset),
              holdMs: nextPreset === "none" ? 0 : 120,
              intensity: 1,
            });
          }}
          value={preset}
        >
          {transitionPresets.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row stage-size-fields">
        <label>
          <span>过渡时长（ms）</span>
          <input
            disabled={disabled}
            min={0}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) {
                onChange({
                  preset,
                  durationMs: Math.max(0, next),
                  holdMs,
                  intensity: value?.intensity ?? 1,
                });
              }
            }}
            type="number"
            value={durationMs}
          />
          <small>过渡动画播多久。</small>
        </label>
        <label>
          <span>停留（ms）</span>
          <input
            disabled={disabled}
            min={0}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) {
                onChange({
                  preset,
                  durationMs,
                  holdMs: Math.max(0, next),
                  intensity: value?.intensity ?? 1,
                });
              }
            }}
            type="number"
            value={holdMs}
          />
          <small>画面布满后再停多久。</small>
        </label>
      </div>
    </>
  );
}

export function EditorApp({ onBackHome }: { onBackHome?: () => void }) {
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
  const setSceneEntry = useEditorStore((state) => state.setSceneEntry);
  const setSceneEnding = useEditorStore((state) => state.setSceneEnding);
  const deleteScene = useEditorStore((state) => state.deleteScene);
  const addCue = useEditorStore((state) => state.addCue);
  const updateCue = useEditorStore((state) => state.updateCue);
  const deleteCue = useEditorStore((state) => state.deleteCue);
  const duplicateCue = useEditorStore((state) => state.duplicateCue);
  const moveCue = useEditorStore((state) => state.moveCue);
  const reorderCue = useEditorStore((state) => state.reorderCue);
  const loadProject = useEditorStore((state) => state.loadProject);
  const setDialogueFont = useEditorStore((state) => state.setDialogueFont);
  const setDialogueHoldMs = useEditorStore((state) => state.setDialogueHoldMs);
  const setDialogueVoiceHoldMs = useEditorStore((state) => state.setDialogueVoiceHoldMs);
  const setDialogueTypingCps = useEditorStore((state) => state.setDialogueTypingCps);
  const setOpeningFadeMs = useEditorStore((state) => state.setOpeningFadeMs);
  const setStageSettings = useEditorStore((state) => state.setStageSettings);
  const setDialogueBox = useEditorStore((state) => state.setDialogueBox);
  const applyDialogueToAll = useEditorStore((state) => state.applyDialogueToAll);
  const markSaved = useEditorStore((state) => state.markSaved);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const { data: backendHealth } = useBackendHealth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backendDocumentRef = useRef<Pick<ProjectDocument, "project" | "revision"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => listBookmarks(project.projectId));
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects());
  const [workMode, setWorkMode] = useState<WorkMode>("script");
  const [exclusiveFullscreen, setExclusiveFullscreen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    window.localStorage.getItem("neoarchive-theme") === "day" ? "day" : "night",
  );
  // 预览区高度（百分比），分隔条可拖拽调整；幕前/幕后共用。
  const [previewHeightPct, setPreviewHeightPct] = useState(() => {
    const stored = window.localStorage.getItem("neoarchive-preview-height");
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) ? Math.min(90, Math.max(30, parsed)) : 62;
  });
  const previewHeightRef = useRef(previewHeightPct);
  previewHeightRef.current = previewHeightPct;
  const activeScene = findScene(project, selectedSceneId) ?? getAllScenes(project)[0];
  const selectedCue =
    activeScene.cues.find((cue) => cue.id === selectedCueId) ?? activeScene.cues[0] ?? null;
  const { playback, runtime, startScene, previewCue, isLivePlayback } = useStoryRuntime(
    project,
    activeScene.id,
    selectedCue?.id,
  );
  const customFont = project.dialogueFontRef ? getUserAsset(project.dialogueFontRef) : null;
  const stage = normalizeStageSettings(project.stage);
  const dialogueBox = normalizeDialogueBox(project.dialogueBox);
  const autoAdvance = useAutoAdvance(project, playback, runtime, isLivePlayback());
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

  const saveBookmark = () => {
    const name = window.prompt(
      "为当前场景存一个书签（命名后就知道是哪段剧情）：",
      activeScene.title,
    );
    if (!name || name.trim() === "") {
      return;
    }
    addBookmark(project.projectId, name, activeScene.id);
    setBookmarks(listBookmarks(project.projectId));
    setNotice("已保存书签");
  };

  const jumpToBookmark = (bookmark: Bookmark) => {
    const scene = findScene(project, bookmark.sceneId);
    if (!scene) {
      setNotice("书签引用的场景不存在");
      return;
    }
    selectScene(bookmark.sceneId);
    setBookmarksOpen(false);
  };

  const renameBookmarkFor = (bookmark: Bookmark) => {
    const name = window.prompt("给书签起个名字：", bookmark.name);
    if (!name || name.trim() === "") {
      return;
    }
    setBookmarks(renameBookmark(project.projectId, bookmark.id, name));
  };

  const removeBookmark = (bookmark: Bookmark) => {
    setBookmarks(deleteBookmark(project.projectId, bookmark.id));
  };

  const handleCreateProject = () => {
    const title = window.prompt("新工程名称：", "未命名工程");
    if (!title) {
      return;
    }
    const { meta } = createNewProject(title);
    setProjects(listProjects());
    setProjectsOpen(false);
    const draft = openProjectDraft(meta.projectId);
    if (draft) {
      loadProject(draft);
      setNotice(`已新建并打开「${draft.title}」`);
    }
  };

  const handleOpenProject = (meta: ProjectMeta) => {
    const draft = openProjectDraft(meta.projectId);
    if (!draft) {
      setNotice("该工程没有本地草稿，无法打开");
      return;
    }
    loadProject(draft);
    setProjectsOpen(false);
    setNotice(`已打开「${draft.title}」`);
  };

  const handleRenameProject = (meta: ProjectMeta) => {
    const title = window.prompt("重命名工程：", meta.title);
    if (!title || title.trim() === "") {
      return;
    }
    const next = renameProject(meta.projectId, title);
    setProjects(next);
  };

  const handleDeleteProject = (meta: ProjectMeta) => {
    if (!window.confirm(`确定删除工程「${meta.title}」？本地草稿会一并删除。`)) {
      return;
    }
    const next = deleteProject(meta.projectId);
    setProjects(next);
    if (meta.projectId === project.projectId) {
      // 删除的是当前工程，回退到示例工程
      loadProject(structuredClone(sampleProject));
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
            onClick={() => {
              useEditorStore.getState().flushDraft();
              onBackHome?.();
            }}
            type="button"
          >
            主页
          </button>
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
          <button
            className="history-button"
            onClick={() => setSettingsOpen((current) => !current)}
            type="button"
          >
            设置
          </button>
          <button
            className="history-button"
            onClick={() => {
              setProjects(listProjects());
              setProjectsOpen(true);
            }}
            type="button"
          >
            工程库
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
              useEditorStore.getState().flushDraft();
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

      {settingsOpen ? (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="工程设置">
          <section className="settings-panel">
            <header>
              <div>
                <p className="eyebrow">PROJECT SETTINGS</p>
                <h2>工程设置</h2>
              </div>
              <button onClick={() => setSettingsOpen(false)} type="button">
                关闭
              </button>
            </header>
            <label>
              <span>全局打字速度（字/秒）</span>
              <DeferredNumberInput
                allowEmpty
                min={1}
                onCommit={(v) => setDialogueTypingCps(v === null ? undefined : v)}
                placeholder="8"
                step={1}
                value={project.dialogueTypingCps ?? null}
              />
              <small>所有对白统一按这个速度逐字出现；留空用默认 8。</small>
            </label>
            <label>
              <span>全局默认停留（秒）</span>
              <DeferredNumberInput
                allowEmpty
                min={0}
                onCommit={(v) => setDialogueHoldMs(v === null ? undefined : Math.round(v * 1000))}
                placeholder="2"
                step={0.25}
                value={project.dialogueHoldMs === undefined ? null : project.dialogueHoldMs / 1000}
              />
              <small>无配音句子播完停这么久；单句可在幕前单独覆盖。</small>
            </label>
            <label>
              <span>配音播完停留（秒）</span>
              <DeferredNumberInput
                allowEmpty
                min={0}
                onCommit={(v) =>
                  setDialogueVoiceHoldMs(v === null ? undefined : Math.round(v * 1000))
                }
                placeholder="1"
                step={0.25}
                value={project.voiceHoldMs === undefined ? null : project.voiceHoldMs / 1000}
              />
              <small>有配音句子播完后停这么久；留空默认 1 秒，单句可在幕前覆盖。</small>
            </label>
            <label>
              <span>开场画面淡入（秒）</span>
              <DeferredNumberInput
                allowEmpty
                min={0}
                onCommit={(v) => setOpeningFadeMs(v === null ? undefined : Math.round(v * 1000))}
                placeholder="1.2"
                step={0.1}
                value={project.openingFadeMs === undefined ? null : project.openingFadeMs / 1000}
              />
              <small>播放成品第一次出现画面时淡入这么久；留空默认 1.2 秒，填 0 关闭。</small>
            </label>
            <div className="settings-section">
              <strong>对话框排版</strong>
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
              {(
                [
                  ["speaker", "说话人字号"],
                  ["subtitle", "身份字号"],
                  ["text", "正文字号"],
                ] as const
              ).map(([key, label]) => {
                const region = dialogueBox[key];
                const updateRegion = (patch: Partial<DialogueRegionStyle>) =>
                  setDialogueBox({ [key]: { ...region, ...patch } });
                return (
                  <label key={key}>
                    <span>{label}</span>
                    <DeferredNumberInput
                      max={120}
                      min={8}
                      onCommit={(v) => v !== null && updateRegion({ fontSize: v })}
                      step={0.1}
                      value={region.fontSize}
                    />
                  </label>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {bookmarksOpen ? (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="存档">
          <section className="settings-panel">
            <header>
              <div>
                <p className="eyebrow">BOOKMARKS</p>
                <h2>存档</h2>
              </div>
              <button onClick={() => setBookmarksOpen(false)} type="button">
                关闭
              </button>
            </header>
            <button className="save-new" onClick={saveBookmark} type="button">
              ＋ 为当前场景存书签
            </button>
            <div className="bookmark-list">
              {bookmarks.length === 0 ? (
                <p className="empty-saves">还没有存档。选中一个场景后点「为当前场景存书签」。</p>
              ) : (
                bookmarks.map((bookmark) => {
                  const scene = findScene(project, bookmark.sceneId);
                  return (
                    <article className="bookmark-row" key={bookmark.id}>
                      <div className="bookmark-meta">
                        <strong>{bookmark.name}</strong>
                        <span>{scene?.title ?? bookmark.sceneId}</span>
                        <time>{new Date(bookmark.createdAt).toLocaleString()}</time>
                      </div>
                      <div className="save-actions row">
                        <button onClick={() => jumpToBookmark(bookmark)} type="button">
                          跳转
                        </button>
                        <button onClick={() => renameBookmarkFor(bookmark)} type="button">
                          改名
                        </button>
                        <button onClick={() => removeBookmark(bookmark)} type="button">
                          删除
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      ) : null}

      {projectsOpen ? (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="工程库">
          <section className="settings-panel project-panel">
            <header>
              <div>
                <p className="eyebrow">PROJECT LIBRARY</p>
                <h2>工程库</h2>
              </div>
              <button onClick={() => setProjectsOpen(false)} type="button">
                关闭
              </button>
            </header>
            <button className="save-new" onClick={handleCreateProject} type="button">
              ＋ 新建工程
            </button>
            <div className="bookmark-list project-list">
              {projects.length === 0 ? (
                <p className="empty-saves">
                  还没有工程。点「新建工程」创建，或从顶栏「导入」打开 .neoarchive.json。
                </p>
              ) : (
                projects.map((meta) => (
                  <article className="project-row" key={meta.projectId}>
                    <div className="project-meta">
                      <strong>{meta.title}</strong>
                      {meta.projectId === project.projectId ? (
                        <span className="is-current">当前</span>
                      ) : null}
                      <time>{new Date(meta.updatedAt).toLocaleString()}</time>
                    </div>
                    <div className="save-actions row">
                      <button onClick={() => handleOpenProject(meta)} type="button">
                        打开
                      </button>
                      <button onClick={() => handleRenameProject(meta)} type="button">
                        改名
                      </button>
                      <button onClick={() => handleDeleteProject(meta)} type="button">
                        删除
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      <section className="workspace">
        <aside className="panel scene-panel" aria-label="场景列表">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{project.chapters[0]?.title.toUpperCase()}</p>
              <h2>场景管理</h2>
            </div>
            <div className="scene-heading-actions">
              <button
                className="bookmark-button"
                onClick={() => setBookmarksOpen(true)}
                type="button"
                aria-label="存档"
                title="存档（书签）"
              >
                书签
              </button>
              <button
                className="icon-button"
                onClick={addScene}
                type="button"
                aria-label="添加场景"
              >
                ＋
              </button>
            </div>
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
              <small>本场默认。单句可在幕后覆盖。成品和「播放场景」共用。</small>
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
              <SceneTransitionEditor
                label="切到下一场"
                onChange={(transition) =>
                  setSceneExit(activeScene.id, { exitTransition: transition })
                }
                value={activeScene.exitTransition}
              />
            ) : (
              <SceneTransitionEditor
                label="收尾过渡"
                onChange={(transition) => setSceneEnding(activeScene.id, transition)}
                value={activeScene.endingTransition}
              />
            )}
            {activeScene.id === project.entrySceneId ? (
              <SceneTransitionEditor
                label="入场过渡"
                onChange={(transition) => setSceneEntry(activeScene.id, transition)}
                value={activeScene.entryTransition}
              />
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
                    value={stage.backgroundFit ?? "cover"}
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

        <section
          className="stage-column"
          style={{ "--preview-h": `${previewHeightPct}%` } as React.CSSProperties}
        >
          <div className="stage-toolbar">
            <span>
              {stageSummary(stage)} · {playback.status} · {selectedCue?.type ?? "empty"}
            </span>
            <div className="toolbar-group" aria-label="幕后工具">
              <span className="live-preview-badge">LIVE</span>
              <button
                onClick={() => previewCue(activeScene.id, selectedCue?.id, true)}
                type="button"
              >
                刷新当前行
              </button>
              <button onClick={() => startScene(activeScene.id)} type="button">
                播放场景
              </button>
            </div>
          </div>

          <div className="stage-fit">
            <StoryStage
              instantText={workMode === "stage" || playback.status !== "playing"}
              layoutEdit={workMode === "stage"}
              stage={stage}
              dialogueBox={dialogueBox}
              onDialogueBoxChange={workMode === "stage" ? setDialogueBox : undefined}
              onBackgroundTransitionComplete={runtime.notifyBackgroundTransitionCompleted}
              onCharacterEnterComplete={runtime.notifyCharacterEnterCompleted}
              onChoose={(optionId) => runtime.choose(optionId)}
              onDialogueComplete={() => autoAdvance.markTextComplete()}
              onVoiceEnded={autoAdvance.markVoiceEnded}
              onBackgroundVideoEnded={autoAdvance.markBackgroundVideoEnded}
              onTransitionComplete={runtime.notifyTransitionCompleted}
              onTransitionCover={runtime.notifyTransitionCovered}
              playback={playback}
            />
          </div>

          <div
            aria-label="调整预览区高度"
            className="stage-resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              const column = event.currentTarget.parentElement;
              if (!column) {
                return;
              }
              const startY = event.clientY;
              const startHeight = column.getBoundingClientRect().height;
              const startPct = previewHeightRef.current;
              const onMove = (moveEvent: PointerEvent) => {
                const delta = moveEvent.clientY - startY;
                const nextPct = Math.min(90, Math.max(30, startPct + (delta / startHeight) * 100));
                setPreviewHeightPct(nextPct);
                window.localStorage.setItem("neoarchive-preview-height", String(nextPct));
              };
              const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
          />

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
              <div className="dialogue-region-editor">
                <strong>分割线</strong>
                <div className="field-row stage-size-fields">
                  <label>
                    <span>X</span>
                    <DeferredNumberInput
                      max={100}
                      min={0}
                      onCommit={(v) =>
                        v !== null &&
                        setDialogueBox({
                          rule: { ...dialogueBox.rule, x: v },
                        })
                      }
                      step={0.1}
                      value={dialogueBox.rule.x}
                    />
                  </label>
                  <label>
                    <span>Y</span>
                    <DeferredNumberInput
                      max={100}
                      min={0}
                      onCommit={(v) =>
                        v !== null &&
                        setDialogueBox({
                          rule: { ...dialogueBox.rule, y: v },
                        })
                      }
                      step={0.1}
                      value={dialogueBox.rule.y}
                    />
                  </label>
                </div>
                <label>
                  <span>长度</span>
                  <DeferredNumberInput
                    max={100}
                    min={4}
                    onCommit={(v) =>
                      v !== null &&
                      setDialogueBox({
                        rule: { ...dialogueBox.rule, width: v },
                      })
                    }
                    step={0.1}
                    value={dialogueBox.rule.width}
                  />
                </label>
              </div>
              {selectedCue?.type === "dialogue.show" ? (
                <label>
                  <span>本句播完停留（秒）</span>
                  <DeferredNumberInput
                    allowEmpty
                    min={0}
                    onCommit={(v) =>
                      updateCue(
                        activeScene.id,
                        selectedCue.id,
                        v === null
                          ? { holdAfterMs: undefined }
                          : { holdAfterMs: Math.max(0, Math.round(v * 1000)) },
                        "holdAfterMs",
                      )
                    }
                    placeholder={`${resolveDialogueHoldMs({ text: selectedCue.text }, activeScene, project) / 1000}`}
                    step={0.25}
                    value={
                      selectedCue.holdAfterMs === undefined ? null : selectedCue.holdAfterMs / 1000
                    }
                  />
                  <small>留空用场景 AUTO。成品和「播放场景」共用这个数。</small>
                </label>
              ) : (
                <p className="voice-error">先在时间线选一句对白，再设播完停留。</p>
              )}
              <button
                className="button button-secondary"
                onClick={() => {
                  setDialogueBox(dialogueBox);
                  applyDialogueToAll();
                  setNotice("已将对话框样式与停留时间应用到全部台词");
                }}
                type="button"
              >
                全部应用
              </button>
              {(
                [
                  ["speaker", "说话人位置"],
                  ["subtitle", "身份位置"],
                  ["text", "正文位置"],
                ] as const
              ).map(([key, label]) => {
                const region = dialogueBox[key];
                const updateRegion = (patch: Partial<DialogueRegionStyle>) =>
                  setDialogueBox({ [key]: { ...region, ...patch } });
                return (
                  <div className="dialogue-region-editor" key={key}>
                    <strong>{label}</strong>
                    <div className="field-row stage-size-fields">
                      <label>
                        <span>X</span>
                        <DeferredNumberInput
                          max={100}
                          min={0}
                          onCommit={(v) => v !== null && updateRegion({ x: v })}
                          step={0.1}
                          value={region.x}
                        />
                      </label>
                      <label>
                        <span>Y</span>
                        <DeferredNumberInput
                          max={100}
                          min={0}
                          onCommit={(v) => v !== null && updateRegion({ y: v })}
                          step={0.1}
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
              voiceHoldDefaultMs={project.voiceHoldMs ?? 1000}
            />
          )}
        </aside>
      </section>
    </main>
  );
}
