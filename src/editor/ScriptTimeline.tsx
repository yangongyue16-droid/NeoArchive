import { useRef, useState } from "react";
import type { Scene, StoryCue } from "../project-schema/types";
import type { AddableCueType } from "../state/editorStore";

type ScriptTimelineProps = {
  scene: Scene;
  selectedCueId: string | null;
  onAdd: (type: AddableCueType) => void;
  onDelete: (cueId: string) => void;
  onDuplicate: (cueId: string) => void;
  onMove: (cueId: string, direction: -1 | 1) => void;
  onReorder: (cueId: string, targetCueId: string, edge: "before" | "after") => void;
  onSelect: (cueId: string) => void;
};

const cueLabels: Record<StoryCue["type"], string> = {
  "audio.play": "音频",
  "audio.stop": "停止音频",
  "background.set": "背景",
  "character.enter": "角色入场",
  "character.exit": "角色退场",
  "character.update": "角色更新",
  "choice.show": "选择",
  "dialogue.show": "对白",
  "transition.play": "过场",
  wait: "等待",
};

function cueSummary(cue: StoryCue): string {
  switch (cue.type) {
    case "background.set":
      return cue.assetRef;
    case "character.enter":
      return `${cue.characterRef} · ${cue.animation}`;
    case "character.update":
      return `${cue.characterRef}${cue.animation ? ` · ${cue.animation}` : ""}`;
    case "character.exit":
      return cue.characterRef;
    case "dialogue.show":
      return `${cue.speaker}：${cue.text}`;
    case "audio.play":
      return `${cue.channel.toUpperCase()} · ${cue.assetRef}`;
    case "audio.stop":
      return cue.channel.toUpperCase();
    case "choice.show":
      return `${cue.prompt ?? "选择"} · ${cue.options.length} 个选项`;
    case "wait":
      return cue.waitForAdvance ? "等待玩家继续" : `等待 ${cue.durationMs ?? 0}ms`;
    case "transition.play":
      return `${cue.preset} · ${cue.durationMs}ms`;
  }
}

const addActions: Array<{ label: string; type: AddableCueType }> = [
  { label: "+ 对白", type: "dialogue.show" },
  { label: "+ 角色", type: "character.enter" },
  { label: "+ 差分", type: "character.update" },
  { label: "+ 退场", type: "character.exit" },
  { label: "+ 背景", type: "background.set" },
  { label: "+ 音频", type: "audio.play" },
  { label: "+ 选择", type: "choice.show" },
  { label: "+ 过场", type: "transition.play" },
  { label: "+ 等待", type: "wait" },
];

export function ScriptTimeline({
  scene,
  selectedCueId,
  onAdd,
  onDelete,
  onDuplicate,
  onMove,
  onReorder,
  onSelect,
}: ScriptTimelineProps) {
  const cues = scene.cues;
  const [draggedCueId, setDraggedCueId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    cueId: string;
    edge: "before" | "after";
  } | null>(null);
  const dropTargetRef = useRef(dropTarget);
  const updateDropTarget = (target: typeof dropTarget) => {
    dropTargetRef.current = target;
    setDropTarget(target);
  };

  return (
    <section className="script-timeline" aria-label="剧本行时间线">
      <div className="script-timeline-heading">
        <div>
          <strong>剧本行 Timeline</strong>
          <span>{cues.length} 个剧本模块 · 拖拽编排，点击预览</span>
        </div>
        <div className="cue-add-actions">
          {addActions.map((action) => (
            <button key={action.type} onClick={() => onAdd(action.type)} type="button">
              {action.label}
            </button>
          ))}
        </div>
      </div>
      <div className="script-cue-list">
        {cues.map((cue, index) => (
          <article
            className={`script-cue-row ${cue.id === selectedCueId ? "is-selected" : ""} ${cue.id === draggedCueId ? "is-dragging" : ""} ${cue.id === dropTarget?.cueId ? `is-drop-${dropTarget.edge}` : ""}`}
            data-cue-id={cue.id}
            key={cue.id}
          >
            <button
              aria-label={`拖拽编排 ${cueLabels[cue.type]}`}
              className="cue-drag-handle"
              onClick={() => onSelect(cue.id)}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDraggedCueId(cue.id);
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                  return;
                }
                const row = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>(".script-cue-row");
                const targetCueId = row?.dataset.cueId;
                if (!row || !targetCueId || targetCueId === cue.id) {
                  updateDropTarget(null);
                  return;
                }
                const bounds = row.getBoundingClientRect();
                updateDropTarget({
                  cueId: targetCueId,
                  edge: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
                });
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                const target = dropTargetRef.current;
                if (target && target.cueId !== cue.id) {
                  onReorder(cue.id, target.cueId, target.edge);
                }
                setDraggedCueId(null);
                updateDropTarget(null);
              }}
              title="按住拖拽编排"
              type="button"
            >
              <span />
              <span />
              <span />
            </button>
            <button className="cue-main" onClick={() => onSelect(cue.id)} type="button">
              <span className={`cue-kind cue-kind-${cue.type.split(".")[0]}`}>
                {cueLabels[cue.type]}
              </span>
              <span className="cue-order">{String(index + 1).padStart(2, "0")}</span>
              <span className="cue-summary">{cueSummary(cue)}</span>
            </button>
            <div className="cue-row-actions">
              <button
                aria-label="上移"
                disabled={index === 0}
                onClick={() => onMove(cue.id, -1)}
                type="button"
              >
                ↑
              </button>
              <button
                aria-label="下移"
                disabled={index === cues.length - 1}
                onClick={() => onMove(cue.id, 1)}
                type="button"
              >
                ↓
              </button>
              <button aria-label="复制" onClick={() => onDuplicate(cue.id)} type="button">
                复制
              </button>
              <button aria-label="删除" onClick={() => onDelete(cue.id)} type="button">
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
