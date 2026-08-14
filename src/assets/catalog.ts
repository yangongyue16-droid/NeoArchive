import { useEffect, useSyncExternalStore } from "react";
import { getAssetCatalog } from "../api/client";

export type AssetOption = {
  label: string;
  value: string;
  preview?: string;
};

export type PublicPackCatalog = {
  audio: Array<AssetOption & { path: string }>;
  backgrounds: Array<AssetOption & { path: string }>;
  characters: Array<AssetOption & { path: string }>;
  generatedAt: string;
  sources?: {
    baAllData?: { indexLastModified?: string };
    schaleDb?: { studentCount?: number };
  };
  stats: {
    audio: number;
    backgrounds: number;
    characters: number;
  };
};

const researchAsset = (path: string) => `/__research/${path}`;
const packAsset = (path: string) => researchAsset(`ba-public-pack/${path}`);
const packCatalogUrl = researchAsset("ba-public-pack/catalog.json");

const fallbackBackgrounds: Record<string, string> = {
  "background/arona-room": researchAsset("curated/backgrounds/BG_AronaRoom.jpg"),
  "background/city-town": researchAsset("curated/backgrounds/BG_CityTown.jpg"),
  "background/classroom": researchAsset("curated/backgrounds/BG_ClassRoom.jpg"),
  "background/game-dev-room": researchAsset("curated/backgrounds/BG_GameDevRoom.jpg"),
  "background/main-office": researchAsset("curated/backgrounds/BG_MainOffice.jpg"),
  "background/park": researchAsset("curated/backgrounds/BG_Park.jpg"),
  "background/ramen-shop": researchAsset("curated/backgrounds/BG_RamenYa.jpg"),
  "background/rooftop": researchAsset("curated/backgrounds/BG_SchoolRooftop.jpg"),
  "background/shopping-mall": researchAsset("curated/backgrounds/BG_ShoppingMall.jpg"),
  "background/kivotos-view": researchAsset("curated/backgrounds/BG_View_Kivotos.jpg"),
};

const fallbackCharacters: Record<string, string> = {
  "character/sakurako-idol": researchAsset(
    "extracted/characters/sakurako_pop_idol_0274/CH0274_spr.skel",
  ),
};

export const fallbackBackgroundOptions: AssetOption[] = [
  { value: "background/classroom", label: "教室" },
  { value: "background/rooftop", label: "学校天台" },
  { value: "background/park", label: "公园" },
  { value: "background/arona-room", label: "阿罗娜房间" },
  { value: "background/city-town", label: "市区" },
  { value: "background/game-dev-room", label: "游戏开发部" },
  { value: "background/main-office", label: "主办公室" },
  { value: "background/ramen-shop", label: "拉面店" },
  { value: "background/shopping-mall", label: "购物中心" },
  { value: "background/kivotos-view", label: "基沃托斯远景" },
];

export const fallbackCharacterOptions: AssetOption[] = [
  { value: "character/sakurako-idol", label: "Sakurako · Pop Idol" },
];

export const audioChannelOptions = [
  { value: "bgm", label: "BGM" },
  { value: "voice", label: "语音" },
  { value: "sfx", label: "音效" },
] as const;

export const fallbackAudioOptions: AssetOption[] = [
  { value: "audio/cc0/tozan-background-music-1.ogg", label: "CC0 · Background Music 1 — Tozan" },
  { value: "audio/cc0/section31-high-alert.ogg", label: "CC0 · High Alert — section31" },
];

function withFallbackAudio(options: readonly AssetOption[]): AssetOption[] {
  const fallbackIds = new Set(fallbackAudioOptions.map((option) => option.value));
  return [...fallbackAudioOptions, ...options.filter((option) => !fallbackIds.has(option.value))];
}

const packBackgrounds = new Map<string, string>();
const packCharacters = new Map<string, string>();
const packAudio = new Map<string, string>();

let loadedCatalog: PublicPackCatalog | null = null;
let loadPromise: Promise<PublicPackCatalog | null> | null = null;
const catalogListeners = new Set<() => void>();

function emitCatalogChange() {
  for (const listener of catalogListeners) {
    listener();
  }
}

function isDirectAssetRef(value: string): boolean {
  return /^(?:https?:|blob:|data:|\/)/.test(value);
}

function toAssetUrl(path: string): string {
  return isDirectAssetRef(path) ? path : packAsset(path);
}

function asPackEntries(
  rows: Array<{ id?: unknown; label?: unknown; path?: unknown; preview?: unknown }> | undefined,
): Array<AssetOption & { path: string }> {
  if (!rows) {
    return [];
  }
  return rows.flatMap((row) => {
    if (typeof row.id !== "string" || typeof row.path !== "string") {
      return [];
    }
    return [
      {
        value: row.id,
        label: typeof row.label === "string" && row.label ? row.label : row.id,
        path: row.path,
        preview: typeof row.preview === "string" && row.preview ? row.preview : undefined,
      },
    ];
  });
}

function applyCatalog(catalog: PublicPackCatalog) {
  packBackgrounds.clear();
  packCharacters.clear();
  packAudio.clear();
  for (const item of catalog.backgrounds) {
    packBackgrounds.set(item.value, item.path);
  }
  for (const item of catalog.characters) {
    packCharacters.set(item.value, item.path);
  }
  for (const item of catalog.audio) {
    packAudio.set(item.value, item.path);
  }
  loadedCatalog = catalog;
  emitCatalogChange();
}

async function loadIndexedCatalog(): Promise<PublicPackCatalog | null> {
  try {
    const { catalog, contentUrl } = await getAssetCatalog("ba-public-pack");
    const toEntry = (entry: {
      assetRef: string;
      label: string;
      id: string;
      previewAssetId: string | null;
    }) => ({
      value: entry.assetRef,
      label: entry.label,
      path: contentUrl(entry.id),
      preview: entry.previewAssetId ? contentUrl(entry.previewAssetId) : undefined,
    });
    const backgrounds = catalog.backgrounds.map(toEntry);
    const characters = catalog.characters.map(toEntry);
    const audio = catalog.audio.map(toEntry);
    if (!backgrounds.length && !characters.length && !audio.length) {
      return null;
    }
    return {
      generatedAt: catalog.generatedAt,
      stats: {
        backgrounds: backgrounds.length,
        characters: characters.length,
        audio: audio.length,
      },
      backgrounds,
      characters,
      audio,
    };
  } catch {
    return null;
  }
}

export function getLoadedPackCatalog(): PublicPackCatalog | null {
  return loadedCatalog;
}

export async function loadPublicPackCatalog(): Promise<PublicPackCatalog | null> {
  if (loadedCatalog) {
    return loadedCatalog;
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = loadIndexedCatalog()
    .then(async (indexedCatalog) => {
      if (indexedCatalog) {
        applyCatalog(indexedCatalog);
        return indexedCatalog;
      }
      return fetch(packCatalogUrl, { cache: "no-store" }).then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const payload = (await response.json()) as {
          audio?: Array<{ id?: unknown; label?: unknown; path?: unknown; preview?: unknown }>;
          backgrounds?: Array<{ id?: unknown; label?: unknown; path?: unknown; preview?: unknown }>;
          characters?: Array<{ id?: unknown; label?: unknown; path?: unknown; preview?: unknown }>;
          generatedAt?: unknown;
          sources?: PublicPackCatalog["sources"];
          stats?: Partial<PublicPackCatalog["stats"]>;
        };
        const backgrounds = asPackEntries(payload.backgrounds);
        const characters = asPackEntries(payload.characters);
        const audio = asPackEntries(payload.audio);
        const catalog: PublicPackCatalog = {
          generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : "",
          sources: payload.sources,
          stats: {
            backgrounds: payload.stats?.backgrounds ?? backgrounds.length,
            characters: payload.stats?.characters ?? characters.length,
            audio: payload.stats?.audio ?? audio.length,
          },
          backgrounds,
          characters,
          audio,
        };
        applyCatalog(catalog);
        return catalog;
      });
    })
    .catch(() => null)
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export async function refreshPublicPackCatalog(): Promise<PublicPackCatalog | null> {
  loadedCatalog = null;
  return loadPublicPackCatalog();
}

function mergeOptions(pack: AssetOption[] | undefined, fallback: AssetOption[]): AssetOption[] {
  if (!pack?.length) {
    return fallback;
  }
  const seen = new Set(pack.map((item) => item.value));
  return [...fallback.filter((item) => !seen.has(item.value)), ...pack];
}

export function getBackgroundOptions(): AssetOption[] {
  return mergeOptions(loadedCatalog?.backgrounds, fallbackBackgroundOptions);
}

export function getCharacterOptions(): AssetOption[] {
  return mergeOptions(loadedCatalog?.characters, fallbackCharacterOptions);
}

export function getAudioOptions(): AssetOption[] {
  return withFallbackAudio(loadedCatalog?.audio ?? []);
}

export const backgroundOptions = fallbackBackgroundOptions;
export const characterOptions = fallbackCharacterOptions;

export function resolveBackground(assetRef: string | null): string | null {
  if (!assetRef) {
    return null;
  }
  if (isDirectAssetRef(assetRef)) {
    return assetRef;
  }
  const fallback = fallbackBackgrounds[assetRef];
  if (fallback) {
    return fallback;
  }
  const packPath = packBackgrounds.get(assetRef);
  if (packPath) {
    return toAssetUrl(packPath);
  }
  if (assetRef.startsWith("background/")) {
    const name = assetRef.slice("background/".length);
    if (name.includes("/")) {
      return packAsset(`ba-all-data/${name}.jpg`);
    }
    return packAsset(`ba-all-data/UIs/03_Scenario/01_Background/${name}.jpg`);
  }
  return null;
}

export function resolveCharacter(characterRef: string): string | null {
  if (isDirectAssetRef(characterRef)) {
    return characterRef;
  }
  const fallback = fallbackCharacters[characterRef];
  if (fallback) {
    return fallback;
  }
  const packPath = packCharacters.get(characterRef);
  if (packPath) {
    return toAssetUrl(packPath);
  }
  if (characterRef.startsWith("character/")) {
    const name = characterRef.slice("character/".length).replace(/_spr$/i, "");
    const folder = `${name}_spr`.toLowerCase();
    const relative = `spine/${folder}/${folder}.skel`;
    if (/^(?:ch|np)\d+/i.test(name)) {
      return packAsset(`ba-all-data-spine42/${relative}`);
    }
    return packAsset(`ba-all-data/${relative}`);
  }
  return null;
}

export function resolveAssetPreview(
  option: AssetOption,
  kind: "background" | "character",
): string | null {
  if (option.preview) {
    return toAssetUrl(option.preview);
  }
  return kind === "background" ? resolveBackground(option.value) : null;
}

export function resolveAudio(assetRef: string): string | null {
  if (isDirectAssetRef(assetRef)) {
    return assetRef;
  }
  const packPath = packAudio.get(assetRef);
  if (packPath) {
    return toAssetUrl(packPath);
  }
  if (assetRef.startsWith("audio/bgm/")) {
    return packAsset(`ba-all-data/Audio/BGM/${assetRef.slice("audio/bgm/".length)}.ogg`);
  }
  if (assetRef.startsWith("audio/sfx/")) {
    return packAsset(`ba-all-data/Audio/Sound/${assetRef.slice("audio/sfx/".length)}.wav`);
  }
  if (assetRef.startsWith("audio/")) {
    if (assetRef.startsWith("audio/cc0/")) {
      return `/${assetRef}`;
    }
    return packAsset(`ba-all-data/${assetRef.slice("audio/".length)}`);
  }
  return null;
}

export function useAssetCatalog() {
  useEffect(() => {
    void refreshPublicPackCatalog();
  }, []);

  const catalog = useSyncExternalStore(
    (onStoreChange) => {
      catalogListeners.add(onStoreChange);
      return () => {
        catalogListeners.delete(onStoreChange);
      };
    },
    getLoadedPackCatalog,
    getLoadedPackCatalog,
  );

  return {
    audioOptions: withFallbackAudio(catalog?.audio ?? []),
    backgroundOptions: mergeOptions(catalog?.backgrounds, fallbackBackgroundOptions),
    characterOptions: mergeOptions(catalog?.characters, fallbackCharacterOptions),
    pack: catalog,
  };
}
