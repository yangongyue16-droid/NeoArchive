export type Bookmark = {
  id: string;
  name: string;
  sceneId: string;
  createdAt: string;
};

const bookmarkPrefix = "neoarchive:bookmarks:v1:";

function storageKey(projectId: string): string {
  return `${bookmarkPrefix}${projectId}`;
}

function isBookmark(value: unknown): value is Bookmark {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Bookmark>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.sceneId === "string"
  );
}

export function listBookmarks(projectId: string): Bookmark[] {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isBookmark).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function addBookmark(projectId: string, name: string, sceneId: string): Bookmark {
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    name: name.trim(),
    sceneId,
    createdAt: new Date().toISOString(),
  };
  const bookmarks = listBookmarks(projectId);
  bookmarks.unshift(bookmark);
  saveAll(projectId, bookmarks);
  return bookmark;
}

export function renameBookmark(projectId: string, id: string, name: string): Bookmark[] {
  const bookmarks = listBookmarks(projectId).map((bookmark) =>
    bookmark.id === id ? { ...bookmark, name: name.trim() } : bookmark,
  );
  saveAll(projectId, bookmarks);
  return bookmarks;
}

export function deleteBookmark(projectId: string, id: string): Bookmark[] {
  const bookmarks = listBookmarks(projectId).filter((bookmark) => bookmark.id !== id);
  saveAll(projectId, bookmarks);
  return bookmarks;
}

function saveAll(projectId: string, bookmarks: Bookmark[]): void {
  window.localStorage.setItem(storageKey(projectId), JSON.stringify(bookmarks));
}
