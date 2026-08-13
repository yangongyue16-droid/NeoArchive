import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { loadDraftProject } from "../project-schema/projectFile";
import { sampleProject } from "../project-schema/sampleProject";
import { findScene } from "../project-schema/types";
import { StoryRuntime, type RuntimeDialogue, type SaveSnapshot } from "../runtime/StoryRuntime";
import { StoryStage } from "./StoryStage";

type HistoryEntry = RuntimeDialogue & { sceneTitle: string | null };

const readStorageKey = "neoarchive:read-dialogue:v1";

function readDialogueIds(): Set<string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(readStorageKey) ?? "[]");
    return new Set(
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function isSaveSnapshot(value: unknown): value is SaveSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SaveSnapshot>;
  return candidate.version === 1 && typeof candidate.projectId === "string" && !!candidate.state;
}

export function PlayerApp() {
  const project = useMemo(() => loadDraftProject() ?? sampleProject, []);
  const runtime = useMemo(() => new StoryRuntime(project), [project]);
  const playback = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  const [autoMode, setAutoMode] = useState(false);
  const [skipMode, setSkipMode] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [completedCueId, setCompletedCueId] = useState<string | null>(null);
  const [currentWasRead, setCurrentWasRead] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const readIds = useMemo(readDialogueIds, []);
  const quickSaveKey = `neoarchive:quick-save:${project.projectId}`;

  useEffect(() => {
    runtime.start();
  }, [runtime]);

  useEffect(() => {
    const dialogue = playback.dialogue;
    if (!dialogue) {
      return;
    }
    setCompletedCueId(null);
    setCurrentWasRead(readIds.has(dialogue.cueId));
    setHistory((current) => {
      if (current.at(-1)?.cueId === dialogue.cueId) {
        return current;
      }
      return [...current, { ...dialogue, sceneTitle: playback.sceneTitle }].slice(-200);
    });
  }, [playback.dialogue?.cueId, playback.dialogue, playback.sceneTitle, readIds]);

  useEffect(() => {
    const dialogue = playback.dialogue;
    if (!dialogue || playback.status !== "waiting_user" || playback.choices.length > 0) {
      return;
    }
    const shouldAdvanceForSkip = skipMode && currentWasRead;
    const shouldAdvanceForAuto = autoMode && completedCueId === dialogue.cueId;
    if (!shouldAdvanceForSkip && !shouldAdvanceForAuto) {
      return;
    }
    const sceneAutoAdvanceMs = playback.sceneId
      ? findScene(project, playback.sceneId)?.autoAdvanceMs
      : undefined;
    const delay = shouldAdvanceForSkip
      ? 70
      : (sceneAutoAdvanceMs ?? Math.max(850, dialogue.text.length * 42));
    const timer = window.setTimeout(() => runtime.advance(), delay);
    return () => window.clearTimeout(timer);
  }, [
    autoMode,
    completedCueId,
    currentWasRead,
    playback.choices.length,
    playback.dialogue,
    playback.status,
    playback.sceneId,
    project,
    runtime,
    skipMode,
  ]);

  const handleDialogueComplete = useCallback(() => {
    const cueId = runtime.getSnapshot().dialogue?.cueId;
    if (!cueId) {
      return;
    }
    setCompletedCueId(cueId);
    readIds.add(cueId);
    window.localStorage.setItem(readStorageKey, JSON.stringify([...readIds]));
  }, [readIds, runtime]);

  const quickSave = () => {
    window.localStorage.setItem(quickSaveKey, JSON.stringify(runtime.createSaveSnapshot()));
    setSaveNotice("已快速保存");
  };

  const quickLoad = () => {
    try {
      const raw = window.localStorage.getItem(quickSaveKey);
      const snapshot: unknown = raw ? JSON.parse(raw) : null;
      if (!isSaveSnapshot(snapshot)) {
        throw new Error("还没有可读取的快速存档。");
      }
      runtime.restoreSaveSnapshot(snapshot);
      setSaveNotice("已读取快速存档");
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : "读取失败");
    }
  };

  return (
    <main className={`player-shell ${uiHidden ? "is-ui-hidden" : ""}`}>
      <header className="player-toolbar">
        <button onClick={() => window.location.assign("/")} type="button">
          返回编辑器
        </button>
        <div>
          <p className="eyebrow">GALGAME PLAYER</p>
          <strong>{playback.sceneTitle ?? project.title}</strong>
        </div>
        <span>
          {autoMode ? "AUTO · " : ""}
          {skipMode ? "SKIP · " : ""}
          {playback.status}
        </span>
      </header>
      <section className="player-stage-wrap">
        <StoryStage
          onAdvance={() => runtime.advance()}
          onChoose={(optionId) => runtime.choose(optionId)}
          onDialogueComplete={handleDialogueComplete}
          onBackgroundTransitionComplete={runtime.notifyBackgroundTransitionCompleted}
          onCharacterEnterComplete={runtime.notifyCharacterEnterCompleted}
          onTransitionComplete={runtime.notifyTransitionCompleted}
          onTransitionCover={runtime.notifyTransitionCovered}
          playback={playback}
        />
      </section>
      <footer className="player-controls">
        <button onClick={() => runtime.start()} type="button">
          从头播放
        </button>
        <button
          className={autoMode ? "is-active" : ""}
          onClick={() => setAutoMode((current) => !current)}
          type="button"
        >
          自动
        </button>
        <button
          className={skipMode ? "is-active" : ""}
          onClick={() => setSkipMode((current) => !current)}
          type="button"
        >
          已读快进
        </button>
        <button onClick={() => setHistoryOpen(true)} type="button">
          对话历史
        </button>
        <button onClick={quickSave} type="button">
          快速保存
        </button>
        <button onClick={quickLoad} type="button">
          快速读取
        </button>
        <button onClick={() => setUiHidden(true)} type="button">
          隐藏 UI
        </button>
        <button onClick={() => runtime.advance()} type="button">
          下一句
        </button>
      </footer>

      {uiHidden ? (
        <button className="show-ui-button" onClick={() => setUiHidden(false)} type="button">
          显示 UI
        </button>
      ) : null}

      {historyOpen ? (
        <div className="history-overlay" role="dialog" aria-modal="true" aria-label="对话历史">
          <section className="history-panel">
            <header>
              <div>
                <p className="eyebrow">BACKLOG</p>
                <h2>对话历史</h2>
              </div>
              <button onClick={() => setHistoryOpen(false)} type="button">
                关闭
              </button>
            </header>
            <div className="history-list">
              {[...history].reverse().map((entry, index) => (
                <article key={`${entry.cueId}:${entry.sceneTitle}:${index}`}>
                  <span>{entry.sceneTitle}</span>
                  <strong>{entry.speaker}</strong>
                  <p>{entry.text}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {saveNotice ? (
        <button className="player-notice" onClick={() => setSaveNotice(null)} type="button">
          {saveNotice}
        </button>
      ) : null}
    </main>
  );
}
