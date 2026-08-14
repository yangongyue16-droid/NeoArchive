export type UserAssetKind = "image" | "video" | "audio" | "font";

export type UserAssetMeta = {
  id: string;
  name: string;
  kind: UserAssetKind;
  mimeType: string;
};

type StoredUserAsset = UserAssetMeta & {
  blob: Blob;
};

const dbName = "neoarchive-user-assets";
const storeName = "files";
const userAssetPrefix = "user:";

const metas = new Map<string, UserAssetMeta>();
const urls = new Map<string, string>();
const listeners = new Set<() => void>();

const imageExtensions = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "webp"]);
const videoExtensions = new Set(["m4v", "mkv", "mov", "mp4", "webm"]);
const audioExtensions = new Set(["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav"]);
const fontExtensions = new Set(["otf", "ttf", "woff", "woff2"]);

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function detectAssetKind(file: Pick<File, "name" | "type">): UserAssetKind | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  if (file.type.startsWith("font/") || file.type.includes("font")) {
    return "font";
  }
  const extension = extensionOf(file.name);
  if (imageExtensions.has(extension)) {
    return "image";
  }
  if (videoExtensions.has(extension)) {
    return "video";
  }
  if (audioExtensions.has(extension)) {
    return "audio";
  }
  if (fontExtensions.has(extension)) {
    return "font";
  }
  return null;
}

export function isUserAssetRef(assetRef: string): boolean {
  return assetRef.startsWith(userAssetPrefix);
}

export function toUserAssetRef(id: string): string {
  return `${userAssetPrefix}${id}`;
}

export function parseUserAssetId(assetRef: string): string | null {
  return isUserAssetRef(assetRef) ? assetRef.slice(userAssetPrefix.length) : null;
}

export async function readUserAssetBlob(assetRef: string): Promise<Blob | null> {
  const id = parseUserAssetId(assetRef);
  if (!id || typeof indexedDB === "undefined") {
    return null;
  }
  const database = await openDatabase();
  const record = await new Promise<StoredUserAsset | undefined>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result as StoredUserAsset | undefined);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地素材"));
  });
  database.close();
  return record?.blob ?? null;
}

export function getUserAsset(assetRef: string): (UserAssetMeta & { url: string }) | null {
  const id = parseUserAssetId(assetRef);
  if (!id) {
    return null;
  }
  const meta = metas.get(id);
  const url = urls.get(id);
  return meta && url ? { ...meta, url } : null;
}

export function subscribeUserAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUserAssetSnapshot(): number {
  return metas.size;
}

function remember(asset: StoredUserAsset): void {
  const existing = urls.get(asset.id);
  if (existing) {
    URL.revokeObjectURL(existing);
  }
  metas.set(asset.id, {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
  });
  urls.set(asset.id, URL.createObjectURL(asset.blob));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地素材库"));
  });
}

export async function hydrateUserAssets(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  const database = await openDatabase();
  const records = await new Promise<StoredUserAsset[]>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result as StoredUserAsset[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地素材库"));
  });
  database.close();
  for (const record of records) {
    remember(record);
  }
  emit();
}

export async function importUserAsset(
  file: File,
  allowed: readonly UserAssetKind[],
): Promise<string> {
  const kind = detectAssetKind(file);
  if (!kind || !allowed.includes(kind)) {
    throw new Error(rejectMessage(allowed));
  }
  const asset: StoredUserAsset = {
    id: crypto.randomUUID(),
    name: file.name,
    kind,
    mimeType: file.type || "application/octet-stream",
    blob: file,
  };
  remember(asset);
  emit();
  if (typeof indexedDB !== "undefined") {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = database
        .transaction(storeName, "readwrite")
        .objectStore(storeName)
        .put(asset);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("本地素材保存失败"));
    });
    database.close();
  }
  return toUserAssetRef(asset.id);
}

export function registerUserAssetForTests(asset: StoredUserAsset): string {
  remember(asset);
  emit();
  return toUserAssetRef(asset.id);
}

function rejectMessage(allowed: readonly UserAssetKind[]): string {
  if (allowed.includes("font")) {
    return "请选择字体文件（ttf / otf / woff / woff2）。";
  }
  if (allowed.includes("video")) {
    return "请选择图片或视频文件（jpg / png / webp / mp4 / webm 等）。";
  }
  return "请选择音频文件（mp3 / wav / ogg / m4a 等）。";
}

export function resetUserAssetsForTests(): void {
  for (const url of urls.values()) {
    URL.revokeObjectURL(url);
  }
  metas.clear();
  urls.clear();
}
