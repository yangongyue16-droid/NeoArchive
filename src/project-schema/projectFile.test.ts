import { describe, expect, it } from "vite-plus/test";
import { parseProjectFile, serializeProject } from "./projectFile";
import { sampleProject } from "./sampleProject";
import {
  gatesSatisfied,
  resolveAdvanceWhen,
  resolveDialogueHoldMs,
  resolveVoiceHoldMs,
} from "./types";

describe("project files", () => {
  it("round-trips a versioned NeoArchive project", () => {
    const restored = parseProjectFile(serializeProject(sampleProject));

    expect(restored).toEqual(sampleProject);
  });

  it("rejects unrelated JSON files", () => {
    expect(() => parseProjectFile('{"name":"not-a-project"}')).toThrow(
      "文件不是有效的 NeoArchive schemaVersion 1 工程。",
    );
  });
});

describe("dialogue hold", () => {
  it("uses the line hold, then scene AUTO, then project default, then 2000", () => {
    expect(resolveDialogueHoldMs({ text: "你好", holdAfterMs: 2500 })).toBe(2500);
    expect(resolveDialogueHoldMs({ text: "你好" }, { autoAdvanceMs: 1200 })).toBe(1200);
    expect(resolveDialogueHoldMs({ text: "你好" }, null, { dialogueHoldMs: 1500 })).toBe(1500);
    expect(resolveDialogueHoldMs({ text: "你好世界" })).toBe(2000);
  });

  it("resolves the voice hold, defaulting to 500ms and supporting 0", () => {
    expect(resolveVoiceHoldMs({})).toBe(500);
    expect(resolveVoiceHoldMs({ voiceHoldMs: 0 })).toBe(0);
    expect(resolveVoiceHoldMs({ voiceHoldMs: 1200 })).toBe(1200);
  });

  it("defaults voice-wait when a line has voice, and waits for all checked gates", () => {
    expect(resolveAdvanceWhen({ voiceAssetRef: "user:voice" })).toEqual({
      text: true,
      voice: true,
      backgroundVideo: false,
    });
    expect(
      gatesSatisfied(
        { text: true, voice: true, backgroundVideo: false },
        { text: true, voice: false, backgroundVideo: true },
      ),
    ).toBe(false);
    expect(
      gatesSatisfied(
        { text: true, voice: true, backgroundVideo: false },
        { text: true, voice: true, backgroundVideo: false },
      ),
    ).toBe(true);
  });
});
