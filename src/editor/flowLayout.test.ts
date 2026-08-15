import { describe, expect, it } from "vitest";
import { computeFlowLayout } from "./flowLayout";
import { computeConnectionEdges } from "./FlowEdges";
import { sampleProject } from "../project-schema/sampleProject";
import type { StoryProject } from "../project-schema/types";

describe("flowLayout", () => {
  it("computes layered positions starting from entrySceneId", () => {
    const positions = computeFlowLayout(sampleProject);
    expect(positions["scene-001"]).toBeDefined();
    expect(positions["scene-002"]).toBeDefined();
    expect(positions["scene-003"]).toBeDefined();

    // Scene 001 is depth 0, Scene 002 is depth 1, Scene 003 is depth 2
    expect(positions["scene-001"].x).toBeLessThan(positions["scene-002"].x);
    expect(positions["scene-002"].x).toBeLessThan(positions["scene-003"].x);
  });

  it("handles isolated scenes without throwing", () => {
    const isolatedProject: StoryProject = {
      ...sampleProject,
      chapters: [
        {
          id: "ch-01",
          title: "Chapter 1",
          scenes: [
            { id: "s1", title: "Scene 1", kind: "dialogue", cues: [] },
            { id: "s2", title: "Scene 2", kind: "dialogue", cues: [] },
          ],
        },
      ],
      entrySceneId: "s1",
    };

    const positions = computeFlowLayout(isolatedProject);
    expect(positions["s1"]).toBeDefined();
    expect(positions["s2"]).toBeDefined();
  });
});

describe("FlowEdges", () => {
  it("extracts linear and choice branch edges from project scenes", () => {
    const scenes = sampleProject.chapters[0].scenes;
    const positions = computeFlowLayout(sampleProject);
    const edges = computeConnectionEdges(scenes, positions);

    // Scene-001 -> Scene-002 (linear)
    const edge1 = edges.find(
      (e) => e.sourceSceneId === "scene-001" && e.targetSceneId === "scene-002",
    );
    expect(edge1).toBeDefined();
    expect(edge1?.kind).toBe("linear");

    // Scene-003 has choice option pointing back to scene-001
    const choiceEdge = edges.find(
      (e) => e.sourceSceneId === "scene-003" && e.targetSceneId === "scene-001",
    );
    expect(choiceEdge).toBeDefined();
    expect(choiceEdge?.kind).toBe("choice");
    expect(choiceEdge?.label).toBe("再看一遍");
  });
});
