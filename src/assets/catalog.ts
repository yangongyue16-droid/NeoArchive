const researchAsset = (path: string) => `/__research/${path}`;

const backgrounds: Record<string, string> = {
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

const characters: Record<string, string> = {
  "character/sakurako-idol": researchAsset(
    "extracted/characters/sakurako_pop_idol_0274/CH0274_spr.skel",
  ),
};

const audio: Record<string, string> = {};

export const backgroundOptions = [
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
] as const;

export const characterOptions = [
  { value: "character/sakurako-idol", label: "Sakurako · Pop Idol" },
] as const;

export const audioChannelOptions = [
  { value: "bgm", label: "BGM" },
  { value: "voice", label: "语音" },
  { value: "sfx", label: "音效" },
] as const;

export function resolveBackground(assetRef: string | null): string | null {
  if (!assetRef) {
    return null;
  }
  return backgrounds[assetRef] ?? (assetRef.startsWith("/") ? assetRef : null);
}

export function resolveCharacter(characterRef: string): string | null {
  return characters[characterRef] ?? null;
}

export function resolveAudio(assetRef: string): string | null {
  return audio[assetRef] ?? (/^(?:https?:|blob:|data:|\/)/.test(assetRef) ? assetRef : null);
}
