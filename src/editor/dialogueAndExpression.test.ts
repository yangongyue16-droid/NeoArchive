import { describe, expect, it } from "vite-plus/test";
import { formatExpressionOption, getCharacterMetadata } from "../assets/catalog";
import { useEditorStore } from "../state/editorStore";

describe("Character Metadata and Expression System", () => {
  it("extracts character metadata from catalog labels and fallback characters", () => {
    expect(getCharacterMetadata("character/sakurako-idol")).toEqual({
      speaker: "Sakurako",
      subtitle: "Trinity General School",
    });

    expect(getCharacterMetadata("character/png-elf-standee")).toEqual({
      speaker: "精灵",
      subtitle: "PNG 立绘试做",
    });
  });

  it("formats expression options with Chinese labels and categories", () => {
    expect(formatExpressionOption("01_normal")).toEqual({
      value: "01",
      label: "01 · 平常 (01_normal)",
      rawName: "01_normal",
      category: "face",
    });

    expect(formatExpressionOption("03_smile")).toEqual({
      value: "03",
      label: "03 · 微笑/开心 (03_smile)",
      rawName: "03_smile",
      category: "face",
    });

    expect(formatExpressionOption("04_embarrassed")).toEqual({
      value: "04",
      label: "04 · 害羞/脸红 (04_embarrassed)",
      rawName: "04_embarrassed",
      category: "face",
    });

    expect(formatExpressionOption("06_depressed")).toEqual({
      value: "06",
      label: "06 · 沮丧/失落 (06_depressed)",
      rawName: "06_depressed",
      category: "face",
    });

    expect(formatExpressionOption("S2_01")).toEqual({
      value: "S2_01",
      label: "S2_01 · 姿势差分 01",
      rawName: "S2_01",
      category: "action",
    });
  });

  it("automatically inherits speaker and subtitle from character entrance when adding dialogue", () => {
    const store = useEditorStore.getState();
    const sceneId = store.addScene("测试场景");

    // Add character entrance for Sakurako
    store.addCue(sceneId, "character.enter");
    const enteredCue = useEditorStore
      .getState()
      .project.chapters[0].scenes.find((s) => s.id === sceneId)
      ?.cues.find((c) => c.type === "character.enter");

    expect(enteredCue).toBeDefined();

    // Now add dialogue
    store.addCue(sceneId, "dialogue.show");
    const addedDialogue = useEditorStore
      .getState()
      .project.chapters[0].scenes.find((s) => s.id === sceneId)
      ?.cues.at(-1);

    expect(addedDialogue?.type).toBe("dialogue.show");
    if (addedDialogue?.type === "dialogue.show") {
      expect(addedDialogue.speaker).toBe("Sakurako");
      expect(addedDialogue.subtitle).toBe("Trinity General School");
    }
  });
});
