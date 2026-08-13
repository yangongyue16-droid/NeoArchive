import { useLayoutEffect, useRef, useState } from "react";
import { BackendApiError, openProject, saveProject, type ProjectDocument } from "../api/client";
import { useAssetCatalog } from "../assets/catalog";
import { useBackendHealth } from "../api/useBackendHealth";
import { downloadProject, parseProjectFile } from "../project-schema/projectFile";
import { findScene, getAllScenes } from "../project-schema/types";
import { StoryStage } from "../player/StoryStage";
import { useStoryRuntime } from "../runtime/useStoryRuntime";
import { useEditorStore } from "../state/editorStore";
import { CueInspector } from "./CueInspector";
import { AudioLibrary, type AudioLibraryMode } from "./AudioLibrary";
import { VisualAssetLibrary } from "./VisualAssetLibrary";
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
  const deleteScene = useEditorStore((state) => state.deleteScene);
  const addCue = useEditorStore((state) => state.addCue);
  const addAudioCue = useEditorStore((state) => state.addAudioCue);
  const updateCue = useEditorStore((state) => state.updateCue);
  const deleteCue = useEditorStore((state) => state.deleteCue);
  const duplicateCue = useEditorStore((state) => state.duplicateCue);
  const moveCue = useEditorStore((state) => state.moveCue);
  const reorderCue = useEditorStore((state) => state.reorderCue);
  const loadProject = useEditorStore((state) => state.loadProject);
  const markSaved = useEditorStore((state) => state.markSaved);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const { data: backendHealth } = useBackendHealth();
  const { audioOptions, backgroundOptions, characterOptions, pack } = useAssetCatalog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backendDocumentRef = useRef<Pick<ProjectDocument, "project" | "revision"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [workMode, setWorkMode] = useState<WorkMode>("script");
  const [audioLibraryMode, setAudioLibraryMode] = useState<AudioLibraryMode | null>(null);
  const [visualLibraryKind, setVisualLibraryKind] = useState<"background" | "character" | null>(
    null,
  );
  const [theme, setTheme] = useState<ThemeMode>(() =>
    window.localStorage.getItem("neoarchive-theme") === "day" ? "day" : "night",
  );
  const activeScene = findScene(project, selectedSceneId) ?? getAllScenes(project)[0];
  const selectedCue =
    activeScene.cues.find((cue) => cue.id === selectedCueId) ?? activeScene.cues[0] ?? null;
  const { playback, runtime } = useStoryRuntime(project, activeScene.id, selectedCue?.id);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("neoarchive-theme", theme);
  }, [theme]);

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
            剧本
          </button>
          <button
            className={workMode === "stage" ? "is-active" : ""}
            onClick={() => setWorkMode("stage")}
            type="button"
          >
            舞台
          </button>
          <button disabled type="button">
            流程
          </button>
          <button
            onClick={() =>
              setVisualLibraryKind(
                selectedCue?.type === "character.enter" ? "character" : "background",
              )
            }
            type="button"
          >
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
          <span className={`status-pill ${backendHealth ? "is-online" : ""}`}>
            {dirty
              ? "自动草稿 · 未保存"
              : backendHealth
                ? `Python · ${backendHealth.database}`
                : "Web 原型"}
          </span>
          <span className="status-pill">
            {pack
              ? `素材 ${pack.stats.backgrounds}/${pack.stats.characters}/${pack.stats.audio}`
              : "素材 抽样"}
          </span>
          <button
            className="button button-primary"
            onClick={() => {
              window.location.assign("/player");
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
            <button
              className="danger-button"
              disabled={getAllScenes(project).length <= 1}
              onClick={() => deleteScene(activeScene.id)}
              type="button"
            >
              删除当前场景
            </button>
          </div>
        </aside>

        <section className="stage-column">
          <div className="stage-toolbar">
            <span>
              16:9 即时预览 · {playback.status} · {selectedCue?.type ?? "empty"}
            </span>
            <div className="toolbar-group" aria-label="舞台工具">
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
              <button onClick={() => setAudioLibraryMode("music")} type="button">
                音乐库
              </button>
              <button onClick={() => setAudioLibraryMode("sfx")} type="button">
                音效库
              </button>
            </div>
          </div>

          <StoryStage
            instantText
            onAdvance={() => runtime.advance()}
            onBackgroundTransitionComplete={runtime.notifyBackgroundTransitionCompleted}
            onCharacterEnterComplete={runtime.notifyCharacterEnterCompleted}
            onChoose={(optionId) => runtime.choose(optionId)}
            onTransitionComplete={runtime.notifyTransitionCompleted}
            onTransitionCover={runtime.notifyTransitionCovered}
            playback={playback}
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
          />
        </section>

        <aside className="panel inspector" aria-label="属性面板">
          <CueInspector
            cue={selectedCue}
            onOpenLibrary={(kind) => {
              if (kind === "audio") {
                setAudioLibraryMode(
                  selectedCue?.type === "audio.play" && selectedCue.channel === "sfx"
                    ? "sfx"
                    : "music",
                );
              } else {
                setVisualLibraryKind(kind);
              }
            }}
            onUpdate={(patch, field) => {
              if (selectedCue) {
                updateCue(activeScene.id, selectedCue.id, patch, field);
              }
            }}
          />
        </aside>
      </section>
      {audioLibraryMode ? (
        <AudioLibrary
          mode={audioLibraryMode}
          onClose={() => setAudioLibraryMode(null)}
          onUse={(assetRef, channel) => {
            if (selectedCue?.type === "audio.play") {
              updateCue(activeScene.id, selectedCue.id, { assetRef, channel }, "audioLibrary");
            } else {
              addAudioCue(activeScene.id, assetRef, channel);
            }
            setAudioLibraryMode(null);
          }}
          options={audioOptions}
          selectedAssetRef={selectedCue?.type === "audio.play" ? selectedCue.assetRef : undefined}
        />
      ) : null}
      {visualLibraryKind ? (
        <VisualAssetLibrary
          kind={visualLibraryKind}
          onClose={() => setVisualLibraryKind(null)}
          onUse={(assetRef) => {
            if (visualLibraryKind === "background") {
              if (selectedCue?.type === "background.set") {
                updateCue(activeScene.id, selectedCue.id, { assetRef }, "visualLibrary");
              } else {
                addCue(activeScene.id, "background.set");
                const addedCueId = useEditorStore.getState().selectedCueId;
                if (addedCueId)
                  updateCue(activeScene.id, addedCueId, { assetRef }, "visualLibrary");
              }
            } else if (selectedCue?.type === "character.enter") {
              updateCue(
                activeScene.id,
                selectedCue.id,
                { characterRef: assetRef },
                "visualLibrary",
              );
            } else {
              addCue(activeScene.id, "character.enter");
              const addedCueId = useEditorStore.getState().selectedCueId;
              if (addedCueId)
                updateCue(activeScene.id, addedCueId, { characterRef: assetRef }, "visualLibrary");
            }
            setVisualLibraryKind(null);
          }}
          options={visualLibraryKind === "background" ? backgroundOptions : characterOptions}
          selectedAssetRef={
            visualLibraryKind === "background" && selectedCue?.type === "background.set"
              ? selectedCue.assetRef
              : visualLibraryKind === "character" && selectedCue?.type === "character.enter"
                ? selectedCue.characterRef
                : undefined
          }
        />
      ) : null}
    </main>
  );
}
