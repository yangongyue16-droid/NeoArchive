import { useMemo } from "react";
import { resolveBackground } from "../assets/catalog";
import type { ChoiceOption, Scene, StoryProject } from "../project-schema/types";

type SceneNodeCardProps = {
  scene: Scene;
  project: StoryProject;
  index: number;
  isSelected: boolean;
  isEntry: boolean;
  isIsolated: boolean;
  position: { x: number; y: number };
  onSelect: (sceneId: string) => void;
  onEditScript: (sceneId: string) => void;
  onSetEntry: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onAddBranchScene: (sourceSceneId: string, choiceCueId?: string, optionId?: string) => void;
  onStartDragNode: (sceneId: string, event: React.PointerEvent<HTMLElement>) => void;
  onStartDragConnection: (
    sourceSceneId: string,
    portY: number,
    kind: "linear" | "choice",
    choiceCueId?: string,
    optionId?: string,
    label?: string,
    event?: React.PointerEvent<HTMLElement>,
  ) => void;
  onDropConnectionTarget: (targetSceneId: string) => void;
  isDropTargetCandidate: boolean;
};

const kindLabels: Record<Scene["kind"], string> = {
  dialogue: "对白",
  direction: "演出",
  choice: "选择",
};

export function SceneNodeCard({
  scene,
  project,
  index,
  isSelected,
  isEntry,
  isIsolated,
  position,
  onSelect,
  onEditScript,
  onSetEntry,
  onDeleteScene,
  onAddBranchScene,
  onStartDragNode,
  onStartDragConnection,
  onDropConnectionTarget,
  isDropTargetCandidate,
}: SceneNodeCardProps) {
  // Find background cue if any
  const bgCue = scene.cues.find(
    (c): c is import("../project-schema/types").BackgroundSetCue => c.type === "background.set",
  );
  const bgUrl = bgCue ? resolveBackground(bgCue.assetRef) : null;

  // Find first dialogue cue if any
  const dialogueCue = scene.cues.find(
    (c): c is import("../project-schema/types").DialogueShowCue => c.type === "dialogue.show",
  );

  // Find choice cues if any
  const choiceCues = scene.cues.filter(
    (c): c is import("../project-schema/types").ChoiceShowCue => c.type === "choice.show",
  );

  const isDeadEnd = !scene.nextSceneId && choiceCues.length === 0;

  return (
    <article
      className={`scene-node-card ${isSelected ? "is-selected" : ""} ${isEntry ? "is-entry" : ""} ${isDropTargetCandidate ? "is-drop-candidate" : ""}`}
      data-scene-id={scene.id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(scene.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEditScript(scene.id);
      }}
      onPointerUp={() => onDropConnectionTarget(scene.id)}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    >
      {/* Inlet Port on Left Edge */}
      <div
        className="flow-port flow-inlet-port"
        onPointerUp={(e) => {
          e.stopPropagation();
          onDropConnectionTarget(scene.id);
        }}
        title="输入端口：拖拽其他场景连线到此"
      >
        <span className="flow-port-dot" />
      </div>

      {/* Card Header (Drag Handle) */}
      <header className="scene-node-header" onPointerDown={(e) => onStartDragNode(scene.id, e)}>
        <div className="scene-node-meta">
          <span className={`scene-node-kind kind-${scene.kind}`}>
            {kindLabels[scene.kind] ?? scene.kind}
          </span>
          <span className="scene-node-index">{String(index + 1).padStart(2, "0")}</span>
          {isEntry ? <span className="scene-node-entry-badge">🚩 入口</span> : null}
        </div>
        <strong className="scene-node-title" title={scene.title}>
          {scene.title}
        </strong>
      </header>

      {/* Card Body */}
      <div className="scene-node-body">
        {bgUrl ? (
          <div className="scene-node-thumbnail">
            <img alt="" src={bgUrl} />
          </div>
        ) : null}

        {dialogueCue ? (
          <p className="scene-node-snippet">
            <strong>{dialogueCue.speaker}：</strong>
            <span>{dialogueCue.text}</span>
          </p>
        ) : (
          <p className="scene-node-snippet is-empty">暂无对白内容</p>
        )}

        {/* Warning Badges */}
        <div className="scene-node-diagnostics">
          {isIsolated && !isEntry ? (
            <span className="node-diagnostic-pill is-warning" title="没有前置场景连接到此场景">
              ⚠️ 孤立场景
            </span>
          ) : null}
          {isDeadEnd ? (
            <span className="node-diagnostic-pill is-neutral" title="没有设置下一个场景出口">
              ⏹ 终点场景
            </span>
          ) : null}
          <span className="node-cue-count">{scene.cues.length} Cues</span>
        </div>
      </div>

      {/* Outlet Ports on Right Edge */}
      <div className="scene-node-outlets">
        {/* Linear Exit Port */}
        <div className="scene-outlet-row is-linear">
          <span className="scene-outlet-label">
            {scene.nextSceneId ? `推进至 ${scene.nextSceneId.slice(0, 8)}...` : "线性出口"}
          </span>
          <button
            className="flow-port-trigger"
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartDragConnection(scene.id, 46, "linear", undefined, undefined, undefined, e);
            }}
            title="按住拖拽连线至下一场景"
            type="button"
          >
            <span className="flow-port-dot" />
          </button>
        </div>

        {/* Choice Branch Ports */}
        {choiceCues.map((cue) =>
          cue.options.map((option, optIdx) => (
            <div className="scene-outlet-row is-choice" key={option.id}>
              <span className="scene-outlet-label" title={option.label}>
                🔀 {option.label}
              </span>
              <button
                className="flow-port-trigger is-choice"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onStartDragConnection(
                    scene.id,
                    76 + optIdx * 26,
                    "choice",
                    cue.id,
                    option.id,
                    option.label,
                    e,
                  );
                }}
                title={`按住拖拽绑定选项【${option.label}】的分支目标`}
                type="button"
              >
                <span className="flow-port-dot is-choice" />
              </button>
            </div>
          )),
        )}
      </div>

      {/* Node Quick Footer Actions */}
      <footer className="scene-node-footer">
        <button
          className="node-action-btn is-primary"
          onClick={(e) => {
            e.stopPropagation();
            onEditScript(scene.id);
          }}
          title="跳转至剧本模式编辑"
          type="button"
        >
          编辑剧本
        </button>
        {!isEntry ? (
          <button
            className="node-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSetEntry(scene.id);
            }}
            title="设为故事入口场景"
            type="button"
          >
            设为入口
          </button>
        ) : null}
        <button
          className="node-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAddBranchScene(scene.id);
          }}
          title="在此场景后新建并连接场景"
          type="button"
        >
          ＋ 分支
        </button>
      </footer>
    </article>
  );
}
