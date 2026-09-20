import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBackgroundMedia } from "../assets/catalog";
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
import { Icon } from "../ui/Icon";
import {
  clearHomeBackground,
  getHomeBackground,
  readImageAsDataUrl,
  setHomeBackground,
} from "./homeBackground";

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "刚刚编辑";
  if (minutes < 60) return `${minutes} 分钟前编辑`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前编辑`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)} 天前编辑`;
  return `${new Date(iso).toLocaleDateString()} 编辑`;
}

export function HomeScreen({ onOpened }: { onOpened: () => void }) {
  const loadProject = useEditorStore((state) => state.loadProject);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects());
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [background, setBackground] = useState<string | null>(() => getHomeBackground());
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [assetRevision, setAssetRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [section, setSection] = useState<"projects" | "guide">("projects");
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => subscribeUserAssets(() => setAssetRevision((value) => value + 1)), []);
  useEffect(() => {
    if (creating) nameInputRef.current?.focus();
  }, [creating]);
  useEffect(() => {
    if (deleteTarget) deleteDialogRef.current?.showModal();
  }, [deleteTarget]);
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const onKeyDown = async (event: KeyboardEvent) => {
      if (event.key !== "Escape" || deleteDialogRef.current?.open) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_exclusive_fullscreen", { fullscreen: false });
      } catch {
        // Fullscreen may already have been exited by the window manager.
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Read each project once; reuse the parsed scenes for the count and cover.
  const projectDetails = useMemo(() => {
    return new Map(
      projects.map((meta) => {
        const scenes =
          openProjectDraft(meta.projectId)?.chapters.flatMap((chapter) => chapter.scenes) ?? [];
        const backgroundCue = scenes
          .flatMap((scene) => scene.cues)
          .find((cue) => cue.type === "background.set" && cue.assetRef);
        const media =
          backgroundCue?.type === "background.set"
            ? resolveBackgroundMedia(backgroundCue.assetRef)
            : null;
        const thumbnail = media?.kind === "image" ? media.url : null;
        return [meta.projectId, { sceneCount: scenes.length, thumbnail }] as const;
      }),
    );
  }, [projects, assetRevision]);
  const visibleProjects = useMemo(() => {
    const matches = projects.filter((project) =>
      project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    );
    return sort === "name"
      ? matches.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"))
      : matches;
  }, [projects, query, sort]);

  const startCreating = () => {
    setSection("projects");
    setCreating(true);
    setNotice(null);
    nameInputRef.current?.focus();
  };
  const cancelCreating = () => {
    setCreating(false);
    setTitle("");
    createButtonRef.current?.focus();
  };
  const enter = (projectId: string) => {
    const draft = openProjectDraft(projectId);
    if (!draft) {
      setNotice("找不到这个项目的本地草稿，请从备份文件重新导入。");
      return;
    }
    loadProject(draft);
    onOpened();
  };
  const handleOpenFile = async (file: File) => {
    setBusy(true);
    setNotice(null);
    try {
      loadProject(parseProjectFile(await file.text()));
      onOpened();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "项目打开失败，请检查文件后重试。");
    } finally {
      setBusy(false);
    }
  };
  const handlePickBackground = async (file: File) => {
    setBackgroundBusy(true);
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setHomeBackground(dataUrl);
      setBackground(dataUrl);
      setNotice("主页背景已更新。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "背景图片读取失败。");
    } finally {
      setBackgroundBusy(false);
    }
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
          <div>
            <h1>NeoArchive</h1>
          </div>
        </div>
        <nav className="home-sidebar-nav" aria-label="主页导航">
          <button
            aria-current={section === "projects" ? "page" : undefined}
            className={section === "projects" ? "is-active" : ""}
            onClick={() => setSection("projects")}
            type="button"
          >
            <Icon name="grid" />
            我的项目
          </button>
          <button
            aria-current={section === "guide" ? "page" : undefined}
            className={section === "guide" ? "is-active" : ""}
            onClick={() => setSection("guide")}
            type="button"
          >
            <Icon name="book" />
            创作指南
          </button>
        </nav>
        <div className="home-sidebar-foot">
          <div className="home-bg-actions">
            <button
              disabled={backgroundBusy}
              onClick={() => backgroundInputRef.current?.click()}
              type="button"
            >
              <Icon name="image" />
              {backgroundBusy ? "正在读取…" : "自定义背景"}
            </button>
            {background ? (
              <button
                disabled={backgroundBusy}
                onClick={() => {
                  clearHomeBackground();
                  setBackground(null);
                  setNotice("已恢复默认背景。");
                }}
                type="button"
              >
                恢复默认背景
              </button>
            ) : null}
          </div>
          <span>
            NeoArchive <span>v0.1.0</span>
          </span>
        </div>
      </aside>
      <section className="home-main" aria-label={section === "projects" ? "我的项目" : "创作指南"}>
        <div className="home-content">
          <section className="home-welcome">
            <div>
              <h2>{section === "guide" ? "创作指南" : "我的项目"}</h2>
            </div>
            <div className="home-primary-actions">
              <button
                ref={createButtonRef}
                className="button button-primary"
                disabled={busy}
                onClick={startCreating}
                type="button"
              >
                <Icon name="plus" />
                新建项目
              </button>
              <button
                className="button button-home-open"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Icon name="folder" />
                {busy ? "正在打开…" : "打开项目"}
              </button>
            </div>
          </section>
          {notice ? (
            <div className="home-notice" role="status">
              <span>{notice}</span>
              <button aria-label="关闭提示" onClick={() => setNotice(null)} type="button">
                <Icon name="close" />
              </button>
            </div>
          ) : null}
          {creating && section === "projects" ? (
            <form
              className="home-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!title.trim() || busy) return;
                try {
                  const { project } = createNewProject(title.trim());
                  loadProject(project);
                  onOpened();
                } catch (error) {
                  setNotice(
                    error instanceof Error ? error.message : "创建失败，请检查本地存储空间后重试。",
                  );
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelCreating();
              }}
            >
              <label htmlFor="project-name">项目名称</label>
              <div>
                <input
                  ref={nameInputRef}
                  id="project-name"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  placeholder="例如：星光来信"
                  maxLength={100}
                  required
                  autoComplete="off"
                />
                <button
                  className="button button-primary"
                  disabled={!title.trim() || busy}
                  type="submit"
                >
                  创建并开始
                  <Icon name="arrow" />
                </button>
                <button className="button button-home-open" onClick={cancelCreating} type="button">
                  取消
                </button>
              </div>
            </form>
          ) : null}
          {section === "guide" ? (
            <section className="home-guide" aria-label="创作步骤">
              <article>
                <span>01</span>
                <div>
                  <h3>搭建故事的场景</h3>
                  <p>新建项目后，在左侧添加和命名场景。选择背景，为故事确定发生的地点。</p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <h3>让角色开始对话</h3>
                  <p>
                    在剧本时间线添加对白、角色和音频。点击一行，在属性面板编辑内容；拖动手柄调整顺序。
                  </p>
                </div>
              </article>
              <article>
                <span>03</span>
                <div>
                  <h3>边创作，边预览</h3>
                  <p>
                    切换「舞台布局」调整对话框，点击「播放场景」检查节奏，使用「播放成品」体验完整故事。
                  </p>
                </div>
              </article>
              <article>
                <span>04</span>
                <div>
                  <h3>保存你的作品</h3>
                  <p>
                    编辑过程中会自动写入本地草稿。点击「保存项目」保存到本地服务；服务不可用时会下载
                    JSON 备份。之后可从主页重新打开备份。
                  </p>
                </div>
              </article>
            </section>
          ) : (
            <section className="home-projects" aria-label="项目库">
              <div className="home-library-toolbar">
                <span className="home-project-count">{projects.length} 个项目</span>
                <div className="home-library-controls">
                  <label className="home-search">
                    <Icon name="search" />
                    <input
                      aria-label="搜索项目"
                      placeholder="搜索项目名称…"
                      value={query}
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      type="search"
                    />
                  </label>
                  <select
                    aria-label="项目排序"
                    value={sort}
                    onChange={(event) => setSort(event.currentTarget.value)}
                  >
                    <option value="recent">最近编辑</option>
                    <option value="name">按名称排序</option>
                  </select>
                </div>
              </div>
              {projects.length === 0 ? (
                <div className="home-empty">
                  <h3>暂无项目</h3>
                  <button className="home-text-action" onClick={startCreating} type="button">
                    创建第一个项目
                    <Icon name="arrow" />
                  </button>
                </div>
              ) : visibleProjects.length === 0 ? (
                <div className="home-no-results" role="status">
                  <Icon name="search" />
                  <h3>没有找到匹配的项目</h3>
                  <button
                    className="button button-home-open"
                    onClick={() => setQuery("")}
                    type="button"
                  >
                    清除搜索
                  </button>
                </div>
              ) : (
                <div className="home-recent-grid">
                  {visibleProjects.map((meta) => {
                    const detail = projectDetails.get(meta.projectId);
                    return (
                      <article className="home-proj-tile" key={meta.projectId}>
                        <button
                          className="home-proj-open"
                          disabled={busy}
                          onClick={() => enter(meta.projectId)}
                          type="button"
                          aria-label={`打开项目 ${meta.title}`}
                        >
                          <div className="home-proj-cover">
                            {detail?.thumbnail ? (
                              <img
                                alt=""
                                className="home-proj-img"
                                src={detail.thumbnail}
                                loading="lazy"
                              />
                            ) : (
                              <span className="home-proj-placeholder" aria-hidden="true">
                                <span>{meta.title.slice(0, 1)}</span>
                              </span>
                            )}
                            <span className="home-proj-open-hint">
                              继续创作
                              <Icon name="arrow" />
                            </span>
                          </div>
                          <div className="home-proj-meta">
                            <strong title={meta.title}>{meta.title}</strong>
                            <span>
                              {detail?.sceneCount ?? 0} 个场景<span>·</span>
                              {timeAgo(meta.updatedAt)}
                            </span>
                          </div>
                        </button>
                        <button
                          className="home-proj-delete"
                          aria-label={`删除项目 ${meta.title}`}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(meta);
                          }}
                          type="button"
                        >
                          <Icon name="trash" />
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </section>
      <input
        tabIndex={-1}
        aria-label="导入项目文件"
        accept=".json,.neoarchive"
        className="visually-hidden"
        ref={fileInputRef}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void handleOpenFile(file);
          event.currentTarget.value = "";
        }}
      />
      <input
        tabIndex={-1}
        aria-label="选择主页背景"
        accept="image/*"
        className="visually-hidden"
        ref={backgroundInputRef}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void handlePickBackground(file);
          event.currentTarget.value = "";
        }}
      />
      <dialog
        className="home-delete-dialog"
        ref={deleteDialogRef}
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-description"
        onClose={() => setDeleteTarget(null)}
      >
        <h2 id="delete-project-title">删除「{deleteTarget?.title}」？</h2>
        <p id="delete-project-description">这个项目的本地草稿会被永久删除。请先确认已保存备份。</p>
        {deleteError ? <p role="alert">{deleteError}</p> : null}
        <div>
          <button
            className="button button-home-open"
            onClick={() => deleteDialogRef.current?.close()}
            type="button"
          >
            保留项目
          </button>
          <button
            className="button home-delete-confirm"
            onClick={() => {
              if (!deleteTarget) return;
              try {
                deleteProject(deleteTarget.projectId);
                setProjects(listProjects());
                deleteDialogRef.current?.close();
                setNotice("项目已删除。");
              } catch {
                setDeleteError("删除失败，请重试。");
              }
            }}
            type="button"
          >
            删除项目
          </button>
        </div>
      </dialog>
    </main>
  );
}
