import { describe, expect, it } from "vite-plus/test";
import { parseProjectFile, serializeProject } from "./projectFile";
import { sampleProject } from "./sampleProject";

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
