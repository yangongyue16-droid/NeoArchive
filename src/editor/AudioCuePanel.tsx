import type { AudioPlayCue } from "../project-schema/types";
import type { EditableCuePatch } from "../state/editorStore";
import { VoiceCuePanel } from "./VoiceCuePanel";

export function AudioCuePanel({
  cue,
  onUpdate,
}: {
  cue: AudioPlayCue;
  onUpdate: (patch: EditableCuePatch, field: string) => void;
}) {
  const label = cue.channel === "bgm" ? "音乐" : cue.channel === "sfx" ? "音效" : "语音";
  return (
    <section className="audio-selection-panel" aria-label={label + "选区"}>
      <strong>{label}选区</strong>
      <p className="field-help">拖动波形把手或输入起止毫秒；循环播放只重复所选区间。</p>
      <VoiceCuePanel
        audioLabel={label}
        previewVolume={cue.volume ?? 1}
        cue={{
          voiceAssetRef: cue.assetRef || undefined,
          voiceStartMs: cue.startMs,
          voiceEndMs: cue.endMs,
        }}
        expanded
        selected
        onChange={(patch) => {
          const next: EditableCuePatch = {};
          if ("voiceAssetRef" in patch) {
            next.assetRef = patch.voiceAssetRef ?? "";
          }
          if ("voiceStartMs" in patch) {
            next.startMs = patch.voiceStartMs;
          }
          if ("voiceEndMs" in patch) {
            next.endMs = patch.voiceEndMs;
          }
          onUpdate(next, "audioSelection");
        }}
      />
    </section>
  );
}
