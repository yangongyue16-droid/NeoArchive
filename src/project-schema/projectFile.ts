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

const draftStorageKey = "neoarchive:project-draft:v1";

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
  return withCoverBackground(parsed);
}

export function loadDraftProject(): StoryProject | null {
  try {
    const contents = window.localStorage.getItem(draftStorageKey);
    return contents ? parseProjectFile(contents) : null;
  } catch {
    return null;
  }
}

export function persistDraftProject(project: StoryProject): void {
  window.localStorage.setItem(draftStorageKey, JSON.stringify(project));
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
