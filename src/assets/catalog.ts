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
  "character/png-elf-standee": researchAsset("curated/characters/png-elf-standee.png"),
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
  {
    value: "character/png-elf-standee",
    label: "PNG 立绘试做 · 半透明",
    preview: researchAsset("curated/characters/png-elf-standee.png"),
  },
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
  if (kind === "background") {
    return resolveBackground(option.value);
  }
  const characterUrl = resolveCharacter(option.value);
  return characterUrl && /\.(?:png|webp|jpe?g|gif)(?:\?|$)/i.test(characterUrl)
    ? characterUrl
    : null;
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

export type CharacterMetadata = {
  speaker: string;
  subtitle: string;
};

export type ExpressionOption = {
  value: string;
  label: string;
  rawName: string;
  category: "face" | "action" | "special";
};

const faceLabelMap: Record<string, string> = {
  default: "默认",
  defalt: "默认",
  normal: "平常",
  nomal: "平常",
  respond: "说话/应答",
  smile: "微笑/开心",
  embarrass: "害羞/脸红",
  embarassed: "害羞/脸红",
  embarrassed: "害羞/脸红",
  serious: "严肃/认真",
  depressed: "沮丧/失落",
  shout: "呼喊/激动",
  angry: "生气",
  surprised: "惊讶/疑惑",
  eyeclose: "闭眼",
  close: "闭眼",
  wink: "眨眼",
  relieved: "安心/放松",
  panic: "慌张",
  cry: "哭泣",
  think: "思考",
  fear: "害怕",
};

export function getCharacterMetadata(characterRef: string): CharacterMetadata {
  if (characterRef === "character/sakurako-idol") {
    return { speaker: "Sakurako", subtitle: "Trinity General School" };
  }
  if (characterRef === "character/png-elf-standee") {
    return { speaker: "精灵", subtitle: "PNG 立绘试做" };
  }

  const options = getCharacterOptions();
  const option = options.find((item) => item.value === characterRef);
  if (!option) {
    const raw = characterRef.replace(/^character\//, "");
    return { speaker: raw, subtitle: "" };
  }

  let speaker = "";
  let subtitle = "";

  const parenMatch = option.label.match(/^([^(（]+)[(（]([^)）]+)[)）]/);
  if (parenMatch) {
    speaker = parenMatch[1].trim();
    subtitle = parenMatch[2].trim();
  } else {
    const dotParts = option.label.split("·");
    speaker = dotParts[0].trim();
    if (dotParts.length > 1) {
      subtitle = dotParts[1].trim();
    }
  }

  return {
    speaker: speaker || option.value,
    subtitle,
  };
}

export function formatExpressionOption(regionName: string): ExpressionOption {
  if (/^s\d+_\d+$/i.test(regionName)) {
    const num = regionName.split("_")[1];
    return {
      value: regionName,
      label: `${regionName} · 姿势差分 ${num}`,
      rawName: regionName,
      category: "action",
    };
  }
  const m = regionName.match(/^([a-zA-Z0-9]+)_(.+)$/);
  if (m) {
    const code = m[1];
    const tag = m[2].toLowerCase();
    const chinese = faceLabelMap[tag] || tag;
    return {
      value: code,
      label: `${code} · ${chinese} (${regionName})`,
      rawName: regionName,
      category: /^s\d+/i.test(code) ? "action" : "face",
    };
  }
  if (/^\d+$/.test(regionName)) {
    return {
      value: regionName,
      label: `${regionName} · 表情差分 ${regionName}`,
      rawName: regionName,
      category: "face",
    };
  }
  if (/^eye_?close/i.test(regionName)) {
    return {
      value: regionName,
      label: `闭眼 · (${regionName})`,
      rawName: regionName,
      category: "face",
    };
  }
  return {
    value: regionName,
    label: regionName,
    rawName: regionName,
    category: "special",
  };
}

export const defaultExpressionPresets: ExpressionOption[] = [
  { value: "00", label: "00 · 默认 (00_default)", rawName: "00_default", category: "face" },
  { value: "01", label: "01 · 平常 (01_normal)", rawName: "01_normal", category: "face" },
  { value: "02", label: "02 · 说话 (02_respond)", rawName: "02_respond", category: "face" },
  { value: "03", label: "03 · 微笑 (03_smile)", rawName: "03_smile", category: "face" },
  { value: "04", label: "04 · 害羞 (04_embarrass)", rawName: "04_embarrass", category: "face" },
  { value: "05", label: "05 · 严肃 (05_serious)", rawName: "05_serious", category: "face" },
  { value: "06", label: "06 · 沮丧 (06_depressed)", rawName: "06_depressed", category: "face" },
];

const expressionsCache = new Map<string, ExpressionOption[]>();

export async function fetchCharacterExpressions(characterRef: string): Promise<ExpressionOption[]> {
  if (expressionsCache.has(characterRef)) {
    return expressionsCache.get(characterRef)!;
  }

  const skelUrl = resolveCharacter(characterRef);
  if (!skelUrl || !skelUrl.endsWith(".skel")) {
    return defaultExpressionPresets;
  }

  const atlasUrl = skelUrl.replace(/\.skel$/, ".atlas");
  try {
    const response = await fetch(atlasUrl);
    if (!response.ok) {
      expressionsCache.set(characterRef, defaultExpressionPresets);
      return defaultExpressionPresets;
    }
    const text = await response.text();
    const lines = text.split(/\r?\n/);
    const regions: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.includes(":") ||
        trimmed.endsWith(".png") ||
        trimmed.endsWith(".jpg") ||
        trimmed.startsWith("size") ||
        trimmed.startsWith("format") ||
        trimmed.startsWith("filter") ||
        trimmed.startsWith("repeat")
      ) {
        continue;
      }
      regions.push(trimmed);
    }

    const seenValues = new Set<string>();
    const options: ExpressionOption[] = [];

    for (const region of regions) {
      const isFaceOrAnim =
        /^(?:\d+|s\d+|eye_?close)/i.test(region) ||
        Object.keys(faceLabelMap).some((tag) => region.toLowerCase().includes(tag));
      if (!isFaceOrAnim) {
        continue;
      }

      const formatted = formatExpressionOption(region);
      if (!seenValues.has(formatted.value)) {
        seenValues.add(formatted.value);
        options.push(formatted);
      }
    }

    const result = options.length > 0 ? options : defaultExpressionPresets;
    expressionsCache.set(characterRef, result);
    return result;
  } catch {
    expressionsCache.set(characterRef, defaultExpressionPresets);
    return defaultExpressionPresets;
  }
}

export function getKnownCharacterExpressions(characterRef: string): ExpressionOption[] {
  return expressionsCache.get(characterRef) ?? defaultExpressionPresets;
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
