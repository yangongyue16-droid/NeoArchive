import { useEffect, useSyncExternalStore } from "react";
import { resolveDialogueFont } from "./catalog";
import { getUserAssetSnapshot, subscribeUserAssets } from "./userAssets";

const loadedFaces = new Map<string, FontFace>();

export function useDialogueFont(assetRef: string | null | undefined): void {
  useSyncExternalStore(subscribeUserAssets, getUserAssetSnapshot, () => 0);
  const font = resolveDialogueFont(assetRef);

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      if (font.url) {
        let face = loadedFaces.get(font.family);
        if (!face) {
          face = new FontFace(font.family, `url(${font.url})`);
          loadedFaces.set(font.family, face);
          await face.load();
          document.fonts.add(face);
        }
      }
      if (!cancelled) {
        document.documentElement.style.setProperty(
          "--dialogue-font",
          `"${font.family}", "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif`,
        );
      }
    };
    void apply();
    return () => {
      cancelled = true;
    };
  }, [font.family, font.url]);
}
