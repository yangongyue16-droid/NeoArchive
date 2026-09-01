import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBackground } from "../assets/catalog";
import { subscribeUserAssets } from "../assets/userAssets";
import { parseProjectFile } from "../project-schema/projectFile";
import {
  createNewProject,
  deleteProject,
  listProjects,
  openProjectDraft,
  type ProjectMeta,
} from "../project-schema/projects";
import { useEditorStore } from "../state/editorStore";
import {
  clearHomeBackground,
  getHomeBackground,
  readImageAsDataUrl,
  setHomeBackground,
} from "./homeBackground";

type HomeScreenProps = {
  onOpened: () => void;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minute = Math.floor(diff / 60_000);
  if (minute < 1) {
    return "刚刚";
  }
  if (minute < 60) {
    return `${minute} 分钟前`;
  }
  const hour = Math.floor(minute / 60);
  if (hour < 24) {
    return `${hour} 小时前`;
  }
  const day = Math.floor(hour / 24);
  if (day < 7) {
    return `${day} 天前`;
  }
  return new Date(iso).toLocaleDateString();
}

export function HomeScreen({ onOpened }: HomeScreenProps) {
  const loadProject = useEditorStore((state) => state.loadProject);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects());
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [background, setBackground] = useState<string | null>(() => getHomeBackground());
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [assetRevision, setAssetRevision] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  // 先让翻转完整可见，稍候白色过渡层才从卡片位置淡入并展开到盖满整屏。
  const [pendingRect, setPendingRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<{
    left: number;
    top: number;
    width: number | string;
    height: number | string;
    borderRadius?: number;
    opacity: number;
  } | null>(null);
  const [overlayExpanded, setOverlayExpanded] = useState(false);

  // 翻转进行约 260ms 后，白色层才出现在卡片位置。
  useEffect(() => {
    if (!pendingRect) {
      return;
    }
    const timer = window.setTimeout(() => {
      setOverlayStyle({
        left: pendingRect.left,
        top: pendingRect.top,
        width: pendingRect.width,
        height: pendingRect.height,
        borderRadius: 14,
        opacity: 0,
      });
      setOverlayExpanded(false);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [pendingRect]);

  // 第一帧渲染好初始位置后，再切成整屏大小触发平滑过渡。
  useEffect(() => {
    if (!overlayStyle || overlayExpanded) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setOverlayStyle({
          left: 0,
          top: 0,
          width: "100vw",
          height: "100vh",
          borderRadius: 0,
          opacity: 1,
        });
        setOverlayExpanded(true);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [overlayStyle, overlayExpanded]);

  // 本地素材（IndexedDB）在启动时异步加载，完成后触发重绘，让封面图能出现。
  useEffect(() => subscribeUserAssets(() => setAssetRevision((value) => value + 1)), []);

  // 和编辑页一致：按 Esc 退出全屏。
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }
    const onKeyDown = async (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_exclusive_fullscreen", { fullscreen: false });
      } catch {
        // ignore
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sceneCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const meta of projects) {
      const draft = openProjectDraft(meta.projectId);
      map.set(
        meta.projectId,
        draft ? draft.chapters.reduce((total, chapter) => total + chapter.scenes.length, 0) : 0,
      );
    }
    return map;
  }, [projects]);

  // 用工程里第一张背景图作为 16:9 卡片的封面，和编辑器里的画面比例一致。
  const thumbnails = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const meta of projects) {
      const draft = openProjectDraft(meta.projectId);
      let url: string | null = null;
      for (const chapter of draft?.chapters ?? []) {
        for (const scene of chapter.scenes) {
          const background = scene.cues.find((cue) => cue.type === "background.set");
          if (background?.assetRef) {
            url = resolveBackground(background.assetRef);
            break;
          }
        }
        if (url) {
          break;
        }
      }
      map.set(meta.projectId, url);
    }
    return map;
  }, [projects, assetRevision]);

  const enter = (projectId: string, tile: HTMLElement | null) => {
    if (openingId !== null) {
      return;
    }
    const draft = openProjectDraft(projectId);
    if (!draft) {
      setNotice("该工程没有本地草稿，无法打开");
      return;
    }
    setOpeningId(projectId);
    // 翻转先完整走完，白色过渡层随后从卡片位置淡入，再从中心向四周展开盖满整屏。
    if (tile) {
      const rect = tile.getBoundingClientRect();
      setPendingRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    } else {
      setOverlayStyle({ left: 0, top: 0, width: "100vw", height: "100vh", opacity: 1 });
      setOverlayExpanded(true);
    }
    window.setTimeout(() => {
      loadProject(draft);
      onOpened();
    }, 880);
  };

  const handleNewProject = () => {
    const title = window.prompt("新工程名称：", "未命名工程");
    if (!title) {
      return;
    }
    const { project } = createNewProject(title);
    loadProject(project);
    onOpened();
  };

  const handleOpenFile = async (file: File) => {
    setBusy(true);
    try {
      const importedProject = parseProjectFile(await file.text());
      loadProject(importedProject);
      onOpened();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "工程打开失败");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (meta: ProjectMeta) => {
    if (!window.confirm(`确定删除工程「${meta.title}」？本地草稿会一并删除。`)) {
      return;
    }
    deleteProject(meta.projectId);
    setProjects(listProjects());
  };

  const handlePickBackground = async (file: File) => {
    setBackgroundBusy(true);
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setHomeBackground(dataUrl);
      setBackground(dataUrl);
      setNotice("主页背景已更新");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "背景图片读取失败");
    } finally {
      setBackgroundBusy(false);
    }
  };

  const handleResetBackground = () => {
    clearHomeBackground();
    setBackground(null);
    setNotice("已恢复默认背景");
  };

  return (
    <main className="home-screen">
      <div
        aria-hidden="true"
        className="home-bg"
        style={background ? { backgroundImage: `url(${background})` } : undefined}
      />
      <aside className="home-sidebar">
        <div className="home-brand">
          <div className="brand-mark" aria-hidden="true" />
          <h1>NeoArchive</h1>
          <p className="eyebrow">GALGAME EDITOR</p>
        </div>
        <nav className="home-sidebar-nav" aria-label="主页导航">
          <button className="is-active" type="button">
            主页
          </button>
          <button disabled type="button">
            教程
          </button>
          <button disabled type="button">
            反馈
          </button>
        </nav>
        <div className="home-sidebar-foot">
          <div className="home-bg-actions">
            <button
              disabled={backgroundBusy}
              onClick={() => backgroundInputRef.current?.click()}
              type="button"
            >
              更换主页背景
            </button>
            {background ? (
              <button disabled={backgroundBusy} onClick={handleResetBackground} type="button">
                恢复默认
              </button>
            ) : null}
          </div>
          <input
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                void handlePickBackground(file);
              }
              event.currentTarget.value = "";
            }}
            ref={backgroundInputRef}
            type="file"
          />
          <span>版本 0.1.0</span>
        </div>
      </aside>

      <section className="home-main">
        <header className="home-head">
          <div>
            <p className="eyebrow">START</p>
            <h2>开始</h2>
          </div>
          <div className="home-primary-actions">
            <button
              className="button button-primary"
              disabled={busy}
              onClick={handleNewProject}
              type="button"
            >
              新建项目
            </button>
            <button
              className="button button-home-open"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              打开项目
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
          </div>
        </header>

        {notice ? (
          <button
            className="editor-notice home-notice"
            onClick={() => setNotice(null)}
            type="button"
          >
            {notice}
          </button>
        ) : null}

        {projects.length === 0 ? (
          <section className="home-section home-empty">
            <div className="brand-mark brand-mark-large" aria-hidden="true" />
            <h3>还没有工程</h3>
            <p>点「新建项目」创建第一个工程，或点「打开项目」导入 .neoarchive.json 文件。</p>
            <button className="button button-primary" onClick={handleNewProject} type="button">
              新建项目
            </button>
          </section>
        ) : (
          <section className="home-section">
            <h3 className="home-section-title">{projects.length > 1 ? "最近项目" : "上次打开"}</h3>
            <div className="home-recent-grid">
              {projects.map((meta, index) => {
                const thumbnail = thumbnails.get(meta.projectId) ?? null;
                return (
                  <article
                    className={`home-proj-tile ${index === 0 ? "is-hero" : ""} ${
                      openingId === meta.projectId ? "is-flipping" : ""
                    }`}
                    key={meta.projectId}
                  >
                    <div className="home-proj-flipper">
                      <button
                        className="home-proj-cover"
                        onClick={(event) =>
                          enter(
                            meta.projectId,
                            event.currentTarget.closest(".home-proj-tile") as HTMLElement | null,
                          )
                        }
                        type="button"
                      >
                        {thumbnail ? (
                          <img alt="" className="home-proj-img" src={thumbnail} />
                        ) : (
                          <span className="home-proj-placeholder" aria-hidden="true">
                            {meta.title.slice(0, 1)}
                          </span>
                        )}
                        <span className="home-proj-scrim" aria-hidden="true" />
                        <span className="home-proj-meta">
                          <strong>{meta.title}</strong>
                          <span>
                            {sceneCounts.get(meta.projectId) ?? 0} 场景 · {timeAgo(meta.updatedAt)}
                          </span>
                        </span>
                        {index === 0 ? <span className="home-proj-badge">上次打开</span> : null}
                      </button>
                      <div className="home-proj-back" aria-hidden="true" />
                    </div>
                    <button
                      className="home-proj-delete"
                      onClick={() => handleDelete(meta)}
                      type="button"
                    >
                      删除
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </section>

      {overlayStyle ? (
        <div
          aria-hidden="true"
          className="home-open-overlay"
          style={{
            left: overlayStyle.left,
            top: overlayStyle.top,
            width: overlayStyle.width,
            height: overlayStyle.height,
            borderRadius: overlayStyle.borderRadius ?? 14,
            opacity: overlayStyle.opacity,
          }}
        />
      ) : null}
    </main>
  );
}
