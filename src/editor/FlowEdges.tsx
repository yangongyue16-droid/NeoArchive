import type { NodePositions } from "./flowLayout";
import type { Scene, StoryProject } from "../project-schema/types";

export type ConnectionEdge = {
  id: string;
  sourceSceneId: string;
  targetSceneId: string;
  kind: "linear" | "choice";
  label?: string;
  choiceCueId?: string;
  optionId?: string;
  sourceYOffset: number;
};

type FlowEdgesProps = {
  project: StoryProject;
  scenes: Scene[];
  positions: NodePositions;
  nodeWidth: number;
  nodeHeight: number;
  activeDragConnection: {
    sourceSceneId: string;
    sourceX: number;
    sourceY: number;
    currentX: number;
    currentY: number;
    kind: "linear" | "choice";
    label?: string;
  } | null;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  onDisconnectEdge?: (edge: ConnectionEdge) => void;
};

export function computeConnectionEdges(
  scenes: Scene[],
  positions: NodePositions,
): ConnectionEdge[] {
  const edges: ConnectionEdge[] = [];
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));

  for (const scene of scenes) {
    if (!positions[scene.id]) continue;

    // Linear nextScene edge
    if (scene.nextSceneId && sceneMap.has(scene.nextSceneId) && positions[scene.nextSceneId]) {
      edges.push({
        id: `linear:${scene.id}->${scene.nextSceneId}`,
        sourceSceneId: scene.id,
        targetSceneId: scene.nextSceneId,
        kind: "linear",
        sourceYOffset: 46, // Top outlet port
      });
    }

    // Choice branch edges
    let choiceOptionCount = 0;
    for (const cue of scene.cues) {
      if (cue.type === "choice.show") {
        for (const opt of cue.options) {
          choiceOptionCount += 1;
          if (
            opt.targetSceneId &&
            sceneMap.has(opt.targetSceneId) &&
            positions[opt.targetSceneId]
          ) {
            edges.push({
              id: `choice:${scene.id}:${opt.id}->${opt.targetSceneId}`,
              sourceSceneId: scene.id,
              targetSceneId: opt.targetSceneId,
              kind: "choice",
              label: opt.label,
              choiceCueId: cue.id,
              optionId: opt.id,
              sourceYOffset: 76 + (choiceOptionCount - 1) * 26,
            });
          }
        }
      }
    }
  }

  return edges;
}

function calculateBezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { path: string; midX: number; midY: number } {
  const dx = Math.abs(x2 - x1);
  const controlOffset = Math.max(40, dx * 0.45);

  const cx1 = x1 + controlOffset;
  const cy1 = y1;
  const cx2 = x2 - controlOffset;
  const cy2 = y2;

  const path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  // Midpoint calculation for t=0.5
  const midX = 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2;
  const midY = 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2;

  return { path, midX, midY };
}

export function FlowEdges({
  project,
  scenes,
  positions,
  nodeWidth,
  nodeHeight,
  activeDragConnection,
  selectedEdgeId,
  onSelectEdge,
  onDisconnectEdge,
}: FlowEdgesProps) {
  const edges = computeConnectionEdges(scenes, positions);
  const inletOffsetY = 46; // Target inlet port height

  return (
    <svg className="flow-edges-layer" aria-hidden="false">
      <defs>
        <marker
          id="flow-arrow-linear"
          markerHeight="7"
          markerUnits="strokeWidth"
          markerWidth="7"
          orient="auto"
          refX="5"
          refY="3.5"
        >
          <polygon fill="var(--accent, #4eb7d8)" points="0 0, 7 3.5, 0 7" />
        </marker>
        <marker
          id="flow-arrow-choice"
          markerHeight="7"
          markerUnits="strokeWidth"
          markerWidth="7"
          orient="auto"
          refX="5"
          refY="3.5"
        >
          <polygon fill="#f5a623" points="0 0, 7 3.5, 0 7" />
        </marker>
        <marker
          id="flow-arrow-drag"
          markerHeight="8"
          markerUnits="strokeWidth"
          markerWidth="8"
          orient="auto"
          refX="5"
          refY="3.5"
        >
          <polygon fill="#ffffff" points="0 0, 7 3.5, 0 7" />
        </marker>
        <filter id="glow-linear" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#4eb7d8" floodOpacity="0.6" />
        </filter>
        <filter id="glow-choice" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f5a623" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* Render Edges */}
      {edges.map((edge) => {
        const sourcePos = positions[edge.sourceSceneId];
        const targetPos = positions[edge.targetSceneId];
        if (!sourcePos || !targetPos) return null;

        const x1 = sourcePos.x + nodeWidth;
        const y1 = sourcePos.y + edge.sourceYOffset;
        const x2 = targetPos.x;
        const y2 = targetPos.y + inletOffsetY;

        const { path, midX, midY } = calculateBezierPath(x1, y1, x2, y2);
        const isSelected = selectedEdgeId === edge.id;
        const isChoice = edge.kind === "choice";

        return (
          <g
            className={`flow-edge-group ${isSelected ? "is-selected" : ""} ${isChoice ? "is-choice" : "is-linear"}`}
            key={edge.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectEdge(isSelected ? null : edge.id);
            }}
          >
            {/* Wider transparent stroke for easier hover/click */}
            <path
              className="flow-edge-hitbox"
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth="20"
            />
            {/* Visual stroke */}
            <path
              className="flow-edge-path"
              d={path}
              fill="none"
              filter={
                isSelected ? (isChoice ? "url(#glow-choice)" : "url(#glow-linear)") : undefined
              }
              markerEnd={isChoice ? "url(#flow-arrow-choice)" : "url(#flow-arrow-linear)"}
              stroke={isChoice ? "#f5a623" : "var(--accent, #4eb7d8)"}
              strokeDasharray={isSelected ? "6 3" : undefined}
              strokeWidth={isSelected ? 3 : 2}
            />

            {/* Edge Label / Badge */}
            {isChoice && edge.label ? (
              <g className="flow-edge-label" transform={`translate(${midX}, ${midY})`}>
                <rect
                  className="flow-edge-label-bg"
                  x={-Math.min(90, Math.max(36, edge.label.length * 6 + 12))}
                  y="-11"
                  width={Math.min(180, Math.max(72, edge.label.length * 12 + 24))}
                  height="22"
                  rx="11"
                />
                <text className="flow-edge-label-text" textAnchor="middle" y="4">
                  {edge.label.length > 10 ? `${edge.label.slice(0, 9)}…` : edge.label}
                </text>
              </g>
            ) : null}

            {/* Disconnect helper when selected */}
            {isSelected && onDisconnectEdge ? (
              <g
                className="flow-edge-disconnect-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDisconnectEdge(edge);
                }}
                transform={`translate(${midX + (isChoice ? 0 : 0)}, ${midY + (isChoice ? 18 : 0)})`}
              >
                <circle cx="0" cy="0" r="10" />
                <text textAnchor="middle" y="3.5">
                  ✕
                </text>
              </g>
            ) : null}
          </g>
        );
      })}

      {/* Active dragging connection line */}
      {activeDragConnection ? (
        <g className="flow-drag-edge">
          <path
            className="flow-drag-path"
            d={
              calculateBezierPath(
                activeDragConnection.sourceX,
                activeDragConnection.sourceY,
                activeDragConnection.currentX,
                activeDragConnection.currentY,
              ).path
            }
            fill="none"
            markerEnd="url(#flow-arrow-drag)"
            stroke={activeDragConnection.kind === "choice" ? "#f5a623" : "var(--accent, #4eb7d8)"}
            strokeDasharray="5 5"
            strokeWidth="2.5"
          />
          <circle
            cx={activeDragConnection.currentX}
            cy={activeDragConnection.currentY}
            fill="#ffffff"
            r="4"
          />
        </g>
      ) : null}
    </svg>
  );
}
