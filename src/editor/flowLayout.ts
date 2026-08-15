import { getAllScenes, type Scene, type StoryProject } from "../project-schema/types";

export type NodePosition = {
  x: number;
  y: number;
};

export type NodePositions = Record<string, NodePosition>;

export type FlowLayoutOptions = {
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
  startX?: number;
  startY?: number;
};

export function computeFlowLayout(
  project: StoryProject,
  options: FlowLayoutOptions = {},
): NodePositions {
  const {
    nodeWidth = 280,
    nodeHeight = 180,
    horizontalSpacing = 120,
    verticalSpacing = 48,
    startX = 80,
    startY = 80,
  } = options;

  const scenes = getAllScenes(project);
  if (scenes.length === 0) {
    return {};
  }

  const sceneMap = new Map<string, Scene>(scenes.map((s) => [s.id, s]));
  const outgoingMap = new Map<string, string[]>();

  for (const scene of scenes) {
    const targets: string[] = [];
    if (scene.nextSceneId && sceneMap.has(scene.nextSceneId)) {
      targets.push(scene.nextSceneId);
    }
    for (const cue of scene.cues) {
      if (cue.type === "choice.show") {
        for (const opt of cue.options) {
          if (opt.targetSceneId && sceneMap.has(opt.targetSceneId)) {
            if (!targets.includes(opt.targetSceneId)) {
              targets.push(opt.targetSceneId);
            }
          }
        }
      }
    }
    outgoingMap.set(scene.id, targets);
  }

  // BFS to assign column / layer depths
  const depthMap = new Map<string, number>();
  const entryId = sceneMap.has(project.entrySceneId) ? project.entrySceneId : scenes[0].id;
  depthMap.set(entryId, 0);

  const queue: string[] = [entryId];
  const visited = new Set<string>([entryId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depthMap.get(currentId) ?? 0;
    const nextIds = outgoingMap.get(currentId) ?? [];

    for (const nextId of nextIds) {
      if (!visited.has(nextId)) {
        visited.add(nextId);
        depthMap.set(nextId, currentDepth + 1);
        queue.push(nextId);
      } else {
        const existingDepth = depthMap.get(nextId) ?? 0;
        if (existingDepth <= currentDepth && nextId !== entryId) {
          depthMap.set(nextId, Math.max(existingDepth, currentDepth + 1));
        }
      }
    }
  }

  // Handle unvisited (isolated) scenes
  let maxDepth = Math.max(0, ...Array.from(depthMap.values()));
  for (const scene of scenes) {
    if (!depthMap.has(scene.id)) {
      maxDepth += 1;
      depthMap.set(scene.id, maxDepth);
    }
  }

  // Group scenes by column/depth
  const columns = new Map<number, string[]>();
  for (const scene of scenes) {
    const depth = depthMap.get(scene.id) ?? 0;
    const list = columns.get(depth) ?? [];
    list.push(scene.id);
    columns.set(depth, list);
  }

  const positions: NodePositions = {};
  const sortedDepths = Array.from(columns.keys()).sort((a, b) => a - b);

  for (const depth of sortedDepths) {
    const sceneIds = columns.get(depth) ?? [];
    const colX = startX + depth * (nodeWidth + horizontalSpacing);

    sceneIds.forEach((sceneId, rowIndex) => {
      const rowY = startY + rowIndex * (nodeHeight + verticalSpacing);
      positions[sceneId] = { x: colX, y: rowY };
    });
  }

  return positions;
}
