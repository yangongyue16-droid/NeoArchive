import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeFlowLayout, type NodePositions } from "./flowLayout";
import { FlowEdges, type ConnectionEdge } from "./FlowEdges";
import { SceneNodeCard } from "./SceneNodeCard";
import { findScene, getAllScenes, type Scene, type StoryProject } from "../project-schema/types";

type FlowWorkspaceProps = {
  project: StoryProject;
  selectedSceneId: string;
  onSelectScene: (sceneId: string) => void;
  onEditScript: (sceneId: string) => void;
  onAddScene: () => void;
  onSetSceneNext: (sceneId: string, nextSceneId?: string) => void;
  onSetEntryScene: (sceneId: string) => void;
  onAddBranchScene: (sourceSceneId: string, choiceCueId?: string, optionId?: string) => void;
  onUpdateChoiceOption: (
    sceneId: string,
    cueId: string,
    optionId: string,
    patch: { targetSceneId?: string },
  ) => void;
  onDeleteScene: (sceneId: string) => void;
};

const NODE_WIDTH = 280;
const NODE_HEIGHT = 190;

export function FlowWorkspace({
  project,
  selectedSceneId,
  onSelectScene,
  onEditScript,
  onAddScene,
  onSetSceneNext,
  onSetEntryScene,
  onAddBranchScene,
  onUpdateChoiceOption,
  onDeleteScene,
}: FlowWorkspaceProps) {
  const scenes = useMemo(() => getAllScenes(project), [project]);
  const activeScene = useMemo(
    () => findScene(project, selectedSceneId) ?? scenes[0],
    [project, selectedSceneId, scenes],
  );

  const [positions, setPositions] = useState<NodePositions>(() => computeFlowLayout(project));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Dragging Canvas Pan
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Dragging Node Card
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const nodeDragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    nodeX: number;
    nodeY: number;
  } | null>(null);

  // Dragging Connection Wire
  const [activeDragConnection, setActiveDragConnection] = useState<{
    sourceSceneId: string;
    sourceX: number;
    sourceY: number;
    currentX: number;
    currentY: number;
    kind: "linear" | "choice";
    choiceCueId?: string;
    optionId?: string;
    label?: string;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Ensure positions exist for newly added scenes
  useEffect(() => {
    setPositions((current) => {
      let changed = false;
      const next = { ...current };
      const computed = computeFlowLayout(project);
      for (const scene of scenes) {
        if (!next[scene.id]) {
          next[scene.id] = computed[scene.id] ?? { x: 80, y: 80 };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [project, scenes]);

  const handleAutoLayout = useCallback(() => {
    const computed = computeFlowLayout(project);
    setPositions(computed);
    setPan({ x: 60, y: 60 });
    setZoom(1);
  }, [project]);

  const handleFitView = useCallback(() => {
    const posList = Object.values(positions);
    if (posList.length === 0 || !canvasRef.current) return;

    const minX = Math.min(...posList.map((p) => p.x));
    const maxX = Math.max(...posList.map((p) => p.x)) + NODE_WIDTH;
    const minY = Math.min(...posList.map((p) => p.y));
    const maxY = Math.max(...posList.map((p) => p.y)) + NODE_HEIGHT;

    const boundsWidth = Math.max(100, maxX - minX);
    const boundsHeight = Math.max(100, maxY - minY);

    const containerWidth = canvasRef.current.clientWidth - 120;
    const containerHeight = canvasRef.current.clientHeight - 120;

    const nextZoom = Math.min(
      1.2,
      Math.max(0.4, Math.min(containerWidth / boundsWidth, containerHeight / boundsHeight)),
    );
    setZoom(nextZoom);
    setPan({
      x: 60 - minX * nextZoom,
      y: 60 - minY * nextZoom,
    });
  }, [positions]);

  // Convert screen coordinates to canvas transformed coordinates
  const screenToCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const rawX = clientX - rect.left;
      const rawY = clientY - rect.top;
      return {
        x: (rawX - pan.x) / zoom,
        y: (rawY - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  // Canvas Wheel Zoom & Pan
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const nextZoom = Math.min(2.0, Math.max(0.3, zoom * zoomFactor));

      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Zoom centered on mouse pointer
        const newPanX = mouseX - (mouseX - pan.x) * (nextZoom / zoom);
        const newPanY = mouseY - (mouseY - pan.y) * (nextZoom / zoom);

        setZoom(nextZoom);
        setPan({ x: newPanX, y: newPanY });
      }
    } else {
      // Pan
      setPan((current) => ({
        x: current.x - e.deltaX,
        y: current.y - e.deltaY,
      }));
    }
  };

  // Pointer Handlers for Canvas Panning & Wire Dragging
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only left click on empty canvas
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setSelectedEdgeId(null);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Handle Canvas Pan
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    // Handle Node Drag
    if (draggingNodeId && nodeDragStartRef.current) {
      const dx = (e.clientX - nodeDragStartRef.current.pointerX) / zoom;
      const dy = (e.clientY - nodeDragStartRef.current.pointerY) / zoom;
      setPositions((current) => ({
        ...current,
        [draggingNodeId]: {
          x: Math.round(nodeDragStartRef.current!.nodeX + dx),
          y: Math.round(nodeDragStartRef.current!.nodeY + dy),
        },
      }));
      return;
    }

    // Handle Wire Drag
    if (activeDragConnection) {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
      setActiveDragConnection((current) =>
        current
          ? {
              ...current,
              currentX: coords.x,
              currentY: coords.y,
            }
          : null,
      );
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (draggingNodeId) {
      setDraggingNodeId(null);
      nodeDragStartRef.current = null;
    }
    if (activeDragConnection) {
      setActiveDragConnection(null);
    }
  };

  // Node Drag Initiator
  const handleStartDragNode = (sceneId: string, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDraggingNodeId(sceneId);
    const pos = positions[sceneId] ?? { x: 0, y: 0 };
    nodeDragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      nodeX: pos.x,
      nodeY: pos.y,
    };
    onSelectScene(sceneId);
  };

  // Connection Drag Initiator
  const handleStartDragConnection = (
    sourceSceneId: string,
    portY: number,
    kind: "linear" | "choice",
    choiceCueId?: string,
    optionId?: string,
    label?: string,
    e?: React.PointerEvent<HTMLElement>,
  ) => {
    if (e) {
      e.stopPropagation();
    }
    const sourcePos = positions[sourceSceneId];
    if (!sourcePos) return;

    const sourceX = sourcePos.x + NODE_WIDTH;
    const sourceY = sourcePos.y + portY;

    setActiveDragConnection({
      sourceSceneId,
      sourceX,
      sourceY,
      currentX: sourceX + 20,
      currentY: sourceY,
      kind,
      choiceCueId,
      optionId,
      label,
    });
  };

  // Connection Target Dropper
  const handleDropConnectionTarget = (targetSceneId: string) => {
    if (!activeDragConnection) return;
    const { sourceSceneId, kind, choiceCueId, optionId } = activeDragConnection;

    if (sourceSceneId === targetSceneId) {
      setActiveDragConnection(null);
      return;
    }

    if (kind === "linear") {
      onSetSceneNext(sourceSceneId, targetSceneId);
    } else if (kind === "choice" && choiceCueId && optionId) {
      onUpdateChoiceOption(sourceSceneId, choiceCueId, optionId, { targetSceneId });
    }

    setActiveDragConnection(null);
  };

  // Disconnect an edge
  const handleDisconnectEdge = (edge: ConnectionEdge) => {
    if (edge.kind === "linear") {
      onSetSceneNext(edge.sourceSceneId, undefined);
    } else if (edge.kind === "choice" && edge.choiceCueId && edge.optionId) {
      onUpdateChoiceOption(edge.sourceSceneId, edge.choiceCueId, edge.optionId, {
        targetSceneId: undefined,
      });
    }
    setSelectedEdgeId(null);
  };

  // Check which scenes are isolated
  const isolatedSceneSet = useMemo(() => {
    const reachable = new Set<string>();
    for (const s of scenes) {
      if (s.nextSceneId) reachable.add(s.nextSceneId);
      for (const cue of s.cues) {
        if (cue.type === "choice.show") {
          for (const opt of cue.options) {
            if (opt.targetSceneId) reachable.add(opt.targetSceneId);
          }
        }
      }
    }
    const isolated = new Set<string>();
    for (const s of scenes) {
      if (s.id !== project.entrySceneId && !reachable.has(s.id)) {
        isolated.add(s.id);
      }
    }
    return isolated;
  }, [scenes, project.entrySceneId]);

  return (
    <section className="flow-workspace">
      {/* Top Flow Mode Toolbar */}
      <header className="flow-toolbar">
        <div className="flow-toolbar-left">
          <span className="flow-badge">FLOW GRAPH</span>
          <span className="flow-stats">
            {scenes.length} 个场景 · {scenes.filter((s) => s.nextSceneId).length} 条连线
          </span>
        </div>

        <div className="flow-toolbar-center">
          <button
            className="flow-tool-btn"
            onClick={handleAutoLayout}
            title="自动拓扑分层排版"
            type="button"
          >
            一键整理布局
          </button>
          <button
            className="flow-tool-btn"
            onClick={handleFitView}
            title="缩放居中自适应"
            type="button"
          >
            居中视图
          </button>
          <div className="flow-zoom-controls">
            <button
              onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))}
              title="缩小"
              type="button"
            >
              −
            </button>
            <span className="flow-zoom-val">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))}
              title="放大"
              type="button"
            >
              ＋
            </button>
          </div>
        </div>

        <div className="flow-toolbar-right">
          <button className="button button-primary flow-add-btn" onClick={onAddScene} type="button">
            ＋ 新建场景
          </button>
          <button
            className="button button-secondary"
            onClick={() => onEditScript(activeScene.id)}
            type="button"
          >
            编辑当前剧本 ({activeScene.title})
          </button>
        </div>
      </header>

      {/* Main Flow Canvas */}
      <div
        className={`flow-canvas-container ${isPanning ? "is-panning" : ""} ${activeDragConnection ? "is-wiring" : ""}`}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onWheel={handleWheel}
        ref={canvasRef}
      >
        {/* Canvas World transformed by Pan & Zoom */}
        <div
          className="flow-canvas-world"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* SVG Edges Layer */}
          <FlowEdges
            activeDragConnection={activeDragConnection}
            nodeHeight={NODE_HEIGHT}
            nodeWidth={NODE_WIDTH}
            onDisconnectEdge={handleDisconnectEdge}
            onSelectEdge={setSelectedEdgeId}
            positions={positions}
            project={project}
            scenes={scenes}
            selectedEdgeId={selectedEdgeId}
          />

          {/* Node Cards Layer */}
          {scenes.map((scene, idx) => (
            <SceneNodeCard
              index={idx}
              isDropTargetCandidate={
                !!activeDragConnection && activeDragConnection.sourceSceneId !== scene.id
              }
              isEntry={scene.id === project.entrySceneId}
              isIsolated={isolatedSceneSet.has(scene.id)}
              isSelected={scene.id === selectedSceneId}
              key={scene.id}
              onAddBranchScene={onAddBranchScene}
              onDeleteScene={onDeleteScene}
              onDropConnectionTarget={handleDropConnectionTarget}
              onEditScript={onEditScript}
              onSelect={onSelectScene}
              onSetEntry={onSetEntryScene}
              onStartDragConnection={handleStartDragConnection}
              onStartDragNode={handleStartDragNode}
              position={positions[scene.id] ?? { x: 80 + idx * 360, y: 80 }}
              project={project}
              scene={scene}
            />
          ))}
        </div>

        {/* Canvas Legend & Tips overlay */}
        <div className="flow-canvas-legend">
          <div className="legend-item">
            <span className="legend-dot is-linear" />
            <span>推进连线 (拖拽右侧圆点)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot is-choice" />
            <span>分支选项 (拖拽黄色圆点)</span>
          </div>
          <div className="legend-item">
            <span>🖱 拖拽背景平移 · 滚轮缩放 · 双击节点编辑剧本</span>
          </div>
        </div>
      </div>
    </section>
  );
}
