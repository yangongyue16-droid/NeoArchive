import { describe, expect, it } from "vite-plus/test";
import { resolveAudio, resolveBackground, resolveCharacter } from "./catalog";

describe("asset catalog", () => {
  it("keeps the curated classroom background", () => {
    expect(resolveBackground("background/classroom")).toBe(
      "/__research/curated/backgrounds/BG_ClassRoom.jpg",
    );
  });

  it("maps pack background ids onto the public story tree", () => {
    expect(resolveBackground("background/BG_OperaHouseStage")).toBe(
      "/__research/ba-public-pack/ba-all-data/UIs/03_Scenario/01_Background/BG_OperaHouseStage.jpg",
    );
  });

  it("sends CH/NP spines to the Spine 4.2 tree", () => {
    expect(resolveCharacter("character/ch0274")).toBe(
      "/__research/ba-public-pack/ba-all-data-spine42/spine/ch0274_spr/ch0274_spr.skel",
    );
  });

  it("keeps named story spines on the main ba-all-data tree", () => {
    expect(resolveCharacter("character/hasumi")).toBe(
      "/__research/ba-public-pack/ba-all-data/spine/hasumi_spr/hasumi_spr.skel",
    );
  });

  it("maps BGM refs onto local ogg files", () => {
    expect(resolveAudio("audio/bgm/Theme_01")).toBe(
      "/__research/ba-public-pack/ba-all-data/Audio/BGM/Theme_01.ogg",
    );
  });

  it("maps story SE refs onto local wav files", () => {
    expect(resolveAudio("audio/sfx/SE_Run_05")).toBe(
      "/__research/ba-public-pack/ba-all-data/Audio/Sound/SE_Run_05.wav",
    );
  });
});
