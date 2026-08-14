import { describe, expect, it } from "vite-plus/test";
import { parseProjectFile, serializeProject } from "./projectFile";
import { sampleProject } from "./sampleProject";
import { resolveDialogueHoldMs } from "./types";

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
  it("uses the line hold, then scene AUTO, then text length", () => {
    expect(resolveDialogueHoldMs({ text: "你好", holdAfterMs: 2500 })).toBe(2500);
    expect(resolveDialogueHoldMs({ text: "你好" }, { autoAdvanceMs: 1200 })).toBe(1200);
    expect(resolveDialogueHoldMs({ text: "你好世界" })).toBe(850);
  });
});
