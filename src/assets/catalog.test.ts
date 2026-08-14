import { afterEach, describe, expect, it } from "vite-plus/test";
import { resolveAudio, resolveBackgroundMedia, resolveDialogueFont } from "./catalog";
import { registerUserAssetForTests, resetUserAssetsForTests } from "./userAssets";

describe("asset catalog", () => {
  afterEach(() => {
    resetUserAssetsForTests();
  });

  it("resolves built-in backgrounds as images", () => {
    expect(resolveBackgroundMedia("background/classroom")).toEqual({
      url: "/__research/curated/backgrounds/BG_ClassRoom.jpg",
      kind: "image",
    });
  });

  it("resolves imported image and video backgrounds", () => {
    const imageRef = registerUserAssetForTests({
      id: "bg-image",
      name: "room.png",
      kind: "image",
      mimeType: "image/png",
      blob: new Blob(["image"], { type: "image/png" }),
    });
    const videoRef = registerUserAssetForTests({
      id: "bg-video",
      name: "city.mp4",
      kind: "video",
      mimeType: "video/mp4",
      blob: new Blob(["video"], { type: "video/mp4" }),
    });

    expect(resolveBackgroundMedia(imageRef)?.kind).toBe("image");
    expect(resolveBackgroundMedia(videoRef)?.kind).toBe("video");
    expect(resolveBackgroundMedia(imageRef)?.url).toMatch(/^blob:/);
  });

  it("resolves imported voice clips", () => {
    const voiceRef = registerUserAssetForTests({
      id: "voice-01",
      name: "line.wav",
      kind: "audio",
      mimeType: "audio/wav",
      blob: new Blob(["audio"], { type: "audio/wav" }),
    });

    expect(resolveAudio(voiceRef)).toMatch(/^blob:/);
    expect(resolveAudio("audio/missing")).toBeNull();
  });

  it("uses Blueaka as the built-in dialogue font", () => {
    expect(resolveDialogueFont(undefined)).toEqual({ family: "Blueaka" });
    expect(resolveDialogueFont("font/blueaka")).toEqual({ family: "Blueaka" });
  });
});
