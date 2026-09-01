import { normalizeStageSettings } from "./stage";
import type { StoryProject } from "./types";

function withCoverBackground(project: StoryProject): StoryProject {
  if (project.stage?.backgroundFit === "fill") {
    return project;
  }
  return {
    ...project,
    stage: { ...normalizeStageSettings(project.stage), backgroundFit: "cover" },
  };
}

/** 剥离场景内的过渡过场行，保证默认无过渡。 */
function stripTransitions(project: StoryProject): StoryProject {
  return {
    ...project,
    chapters: project.chapters.map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.map((scene) => ({
        ...scene,
        cues: scene.cues.filter((cue) => cue.type !== "transition.play"),
      })),
    })),
  };
}

const draftStorageKeyV1 = "neoarchive:project-draft:v1";
const activeProjectKey = "neoarchive:active-project:v1";
const draftPrefix = "neoarchive:project-draft:v1:";

function draftStorageKey(projectId: string): string {
  return `${draftPrefix}${projectId}`;
}

/** 当前激活的工程 id（用于读取最近打开的草稿）。 */
export function getActiveProjectId(): string | null {
  try {
    return window.localStorage.getItem(activeProjectKey);
  } catch {
    return null;
  }
}

export function setActiveProjectId(projectId: string): void {
  try {
    window.localStorage.setItem(activeProjectKey, projectId);
  } catch {
    // ignore
  }
}

function isStoryProject(value: unknown): value is StoryProject {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoryProject>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.projectId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.entrySceneId === "string" &&
    Array.isArray(candidate.chapters) &&
    candidate.chapters.every(
      (chapter) =>
        chapter &&
        typeof chapter.id === "string" &&
        typeof chapter.title === "string" &&
        Array.isArray(chapter.scenes) &&
        chapter.scenes.every(
          (scene) =>
            scene &&
            typeof scene.id === "string" &&
            typeof scene.title === "string" &&
            Array.isArray(scene.cues) &&
            scene.cues.every(
              (cue) => cue && typeof cue.id === "string" && typeof cue.type === "string",
            ),
        ),
    )
  );
}

export function parseProjectFile(contents: string): StoryProject {
  const parsed: unknown = JSON.parse(contents);
  if (!isStoryProject(parsed)) {
    throw new Error("文件不是有效的 NeoArchive schemaVersion 1 工程。");
  }
  return stripTransitions(withCoverBackground(parsed));
}

/** 读取指定工程的本地草稿；无则 null。 */
export function loadDraftProjectFor(projectId: string): StoryProject | null {
  try {
    const contents = window.localStorage.getItem(draftStorageKey(projectId));
    return contents ? parseProjectFile(contents) : null;
  } catch {
    return null;
  }
}

/** 读取当前激活工程的草稿（兼容旧单草稿键）。 */
export function loadDraftProject(): StoryProject | null {
  const active = getActiveProjectId();
  if (active) {
    return loadDraftProjectFor(active);
  }
  // 兼容旧版单草稿键
  try {
    const contents = window.localStorage.getItem(draftStorageKeyV1);
    return contents ? parseProjectFile(contents) : null;
  } catch {
    return null;
  }
}

export function persistDraftProject(project: StoryProject): void {
  window.localStorage.setItem(draftStorageKey(project.projectId), JSON.stringify(project));
  setActiveProjectId(project.projectId);
}

/** 删除指定工程的本地草稿。 */
export function deleteDraftProject(projectId: string): void {
  window.localStorage.removeItem(draftStorageKey(projectId));
  if (getActiveProjectId() === projectId) {
    window.localStorage.removeItem(activeProjectKey);
  }
}

export function serializeProject(project: StoryProject): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function downloadProject(project: StoryProject): void {
  const blob = new Blob([serializeProject(project)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${project.title.trim().replaceAll(/[^\p{L}\p{N}_-]+/gu, "-") || "story"}.neoarchive.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
