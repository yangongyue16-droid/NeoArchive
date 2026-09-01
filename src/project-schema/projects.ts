import { deleteDraftProject, loadDraftProjectFor, persistDraftProject } from "./projectFile";
import type { StoryProject } from "./types";

export type ProjectMeta = {
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

const indexKey = "neoarchive:project-index:v1";

function isProjectMeta(value: unknown): value is ProjectMeta {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ProjectMeta>;
  return (
    typeof candidate.projectId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

export function listProjects(): ProjectMeta[] {
  try {
    const raw = window.localStorage.getItem(indexKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isProjectMeta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function upsertProjectMeta(meta: ProjectMeta): ProjectMeta[] {
  const projects = listProjects().filter((item) => item.projectId !== meta.projectId);
  projects.unshift(meta);
  saveAll(projects);
  return listProjects();
}

export function deleteProjectMeta(projectId: string): ProjectMeta[] {
  const projects = listProjects().filter((item) => item.projectId !== projectId);
  saveAll(projects);
  return listProjects();
}

/** 删除工程：连索引和本地草稿一起删。 */
export function deleteProject(projectId: string): ProjectMeta[] {
  deleteDraftProject(projectId);
  return deleteProjectMeta(projectId);
}

/** 重命名工程：更新草稿 title 和索引。 */
export function renameProject(projectId: string, title: string): ProjectMeta[] {
  const trimmed = title.trim();
  const project = loadDraftProjectFor(projectId);
  if (project) {
    const renamed = {
      ...project,
      title: trimmed || project.title,
      updatedAt: new Date().toISOString(),
    };
    persistDraftProject(renamed);
  }
  const projects = listProjects().map((item) =>
    item.projectId === projectId
      ? { ...item, title: trimmed || item.title, updatedAt: new Date().toISOString() }
      : item,
  );
  saveAll(projects);
  return listProjects();
}

/** 从草稿列出所有已有工程（草稿 key 是权威）。 */
export function listProjectMetasFromDrafts(): ProjectMeta[] {
  // 只依赖已登记的索引；确保索引中已有工程与草稿存在对应关系。
  return listProjects();
}

/** 新建一个空白工程并登记。 */
export function createNewProject(title: string): { meta: ProjectMeta; project: StoryProject } {
  const projectId = `neoarchive-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const sceneId = `scene-${crypto.randomUUID()}`;
  const project: StoryProject = {
    schemaVersion: 1,
    projectId,
    title: title.trim() || "未命名工程",
    entrySceneId: sceneId,
    createdAt: now,
    updatedAt: now,
    dialogueTypingCps: 8,
    chapters: [
      {
        id: `chapter-${crypto.randomUUID()}`,
        title: "Chapter 01",
        scenes: [
          {
            id: sceneId,
            title: "场景 01",
            kind: "dialogue",
            cues: [
              {
                id: `cue-bg-${crypto.randomUUID()}`,
                type: "background.set",
                atMs: 0,
                assetRef: "",
                transitionMs: 400,
              },
              {
                id: `cue-dlg-${crypto.randomUUID()}`,
                type: "dialogue.show",
                atMs: 500,
                speaker: "",
                subtitle: "",
                text: "",
                typingCps: 8,
                waitForAdvance: true,
              },
            ],
          },
        ],
      },
    ],
  };
  persistDraftProject(project);
  const meta: ProjectMeta = { projectId, title: project.title, createdAt: now, updatedAt: now };
  upsertProjectMeta(meta);
  return { meta, project };
}

/** 登记一个已存在于草稿中的工程（在索引中补一条）。 */
export function registerProject(project: StoryProject): ProjectMeta[] {
  const meta: ProjectMeta = {
    projectId: project.projectId,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  return upsertProjectMeta(meta);
}

function saveAll(projects: ProjectMeta[]): void {
  window.localStorage.setItem(indexKey, JSON.stringify(projects));
}

/** 读取工程草稿；无则 null。 */
export function openProjectDraft(projectId: string): StoryProject | null {
  return loadDraftProjectFor(projectId);
}
