import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { loadDraftProject } from "../project-schema/projectFile";
import { sampleProject } from "../project-schema/sampleProject";
import { StoryRuntime, type RuntimeDialogue } from "../runtime/StoryRuntime";
import { useAutoAdvance } from "../runtime/useAutoAdvance";
import { useDialogueFont } from "../assets/useDialogueFont";
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

export function PlayerApp() {
  const project = useMemo(() => loadDraftProject() ?? sampleProject, []);
  useDialogueFont(project.dialogueFontRef);
  const runtime = useMemo(() => new StoryRuntime(project), [project]);
  const playback = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  const [autoMode, setAutoMode] = useState(true);
  const [skipMode, setSkipMode] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(true);
  const [hudHidden, setHudHidden] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const autoAdvance = useAutoAdvance(project, playback, runtime, autoMode);
  const [currentWasRead, setCurrentWasRead] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const readIds = useMemo(readDialogueIds, []);

  useEffect(() => {
    runtime.start();
  }, [runtime]);

  useEffect(() => {
    const dialogue = playback.dialogue;
    if (!dialogue) {
      return;
    }
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
    if (
      !dialogue ||
      playback.status !== "waiting_user" ||
      playback.choices.length > 0 ||
      !skipMode ||
      !currentWasRead
    ) {
      return;
    }
    const timer = window.setTimeout(() => runtime.advance(), 70);
    return () => window.clearTimeout(timer);
  }, [
    currentWasRead,
    playback.choices.length,
    playback.dialogue,
    playback.status,
    runtime,
    skipMode,
  ]);

  const setExclusiveFullscreen = useCallback(async (next: boolean) => {
    try {
      if ("__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_exclusive_fullscreen", { fullscreen: next });
      } else if (next) {
        await document.documentElement.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      setFullscreen(next);
    } catch {
      setFullscreen(next);
    }
  }, []);

  // 播放结束（收尾过渡播完后）自动回到主界面
  useEffect(() => {
    if (playback.status !== "completed") {
      return;
    }
    const timer = window.setTimeout(() => {
      void setExclusiveFullscreen(false);
      window.location.hash = "";
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [playback.status, setExclusiveFullscreen]);

  useEffect(() => {
    void setExclusiveFullscreen(true);
    setChromeHidden(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void setExclusiveFullscreen(false);
        window.location.hash = "";
        return;
      }
      if (event.key === "h" || event.key === "H") {
        setChromeHidden((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      void setExclusiveFullscreen(false);
    };
  }, [setExclusiveFullscreen]);

  const handleDialogueComplete = useCallback(() => {
    const cueId = runtime.getSnapshot().dialogue?.cueId;
    if (!cueId) {
      return;
    }
    autoAdvance.markTextComplete(cueId);
    readIds.add(cueId);
    window.localStorage.setItem(readStorageKey, JSON.stringify([...readIds]));
  }, [autoAdvance, readIds, runtime]);

  return (
    <main
      className={`player-shell ${chromeHidden ? "is-chrome-hidden" : ""}`}
      onContextMenu={(event) => {
        event.preventDefault();
        setHudHidden((current) => !current);
      }}
    >
      <header className="player-toolbar">
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
      <section className="player-stage-wrap stage-fit">
        <StoryStage
          hideHud={hudHidden}
          stage={project.stage}
          dialogueBox={project.dialogueBox}
          onAdvance={() => runtime.advance()}
          onChoose={(optionId) => runtime.choose(optionId)}
          onDialogueComplete={handleDialogueComplete}
          onVoiceEnded={autoAdvance.markVoiceEnded}
          onBackgroundVideoEnded={autoAdvance.markBackgroundVideoEnded}
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
        <button onClick={() => setChromeHidden(true)} type="button">
          隐藏 UI
        </button>
        <button
          className={hudHidden ? "is-active" : ""}
          onClick={() => setHudHidden((current) => !current)}
          type="button"
        >
          {hudHidden ? "显示对话框" : "隐藏对话框"}
        </button>
        <button
          className={fullscreen ? "is-active" : ""}
          onClick={() => void setExclusiveFullscreen(!fullscreen)}
          type="button"
        >
          {fullscreen ? "退出全屏" : "全屏"}
        </button>
        <button onClick={() => runtime.advance()} type="button">
          下一句
        </button>
      </footer>

      {chromeHidden ? (
        <div className="player-reveal-zone" onMouseEnter={() => setChromeHidden(false)} />
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
