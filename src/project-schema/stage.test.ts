import { describe, expect, it } from "vite-plus/test";
import { normalizeDialogueBox, normalizeStageSettings, stageSummary } from "./stage";

describe("stage settings", () => {
  it("defaults to 1920x1080 16:9", () => {
    expect(normalizeStageSettings()).toEqual({
      aspect: "16:9",
      width: 1920,
      height: 1080,
      backgroundFit: "contain",
    });
  });

  it("fills preset resolutions", () => {
    expect(normalizeStageSettings({ aspect: "9:16" })).toEqual({
      aspect: "9:16",
      width: 1080,
      height: 1920,
      backgroundFit: "contain",
    });
  });

  it("keeps custom width and height", () => {
    expect(normalizeStageSettings({ aspect: "custom", width: 1280, height: 800 })).toEqual({
      aspect: "custom",
      width: 1280,
      height: 800,
      backgroundFit: "contain",
    });
    expect(stageSummary({ aspect: "custom", width: 1280, height: 800 })).toBe("1280×800 · 自定义");
  });

  it("keeps background fit mode", () => {
    expect(normalizeStageSettings({ backgroundFit: "fill" }).backgroundFit).toBe("fill");
  });

  it("normalizes dialogue box layout", () => {
    expect(normalizeDialogueBox({ heightPercent: 60 }).heightPercent).toBe(60);
    expect(normalizeDialogueBox({ speaker: { fontSize: 40 } }).speaker.fontSize).toBe(40);
    expect(normalizeDialogueBox({ text: { x: 12, y: 50 } }).text).toMatchObject({
      x: 12,
      y: 50,
    });
    expect(normalizeDialogueBox({ rule: { y: 40, width: 60 } }).rule).toMatchObject({
      y: 40,
      width: 60,
    });
  });
});
