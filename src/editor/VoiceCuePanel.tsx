import { useCallback, useEffect, useRef, useState } from "react";
import { resolveAudio } from "../assets/catalog";
import { getUserAsset, importUserAsset, readUserAssetBlob } from "../assets/userAssets";
import type { DialogueShowCue } from "../project-schema/types";

type VoiceCuePanelProps = {
  cue: DialogueShowCue;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: { voiceAssetRef?: string; voiceStartMs?: number }) => void;
};

export function hasBoundVoice(cue: DialogueShowCue): boolean {
  return Boolean(cue.voiceAssetRef) && cue.voiceStartMs !== undefined;
}

export function VoiceStatusButton({
  bound,
  expanded,
  onToggle,
}: {
  bound: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label={bound ? "已绑定语音，点击展开或收起" : "未绑定语音，点击展开或收起"}
      className={`voice-status ${bound ? "is-bound" : ""} ${expanded ? "is-open" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      type="button"
    >
      <span aria-hidden="true" />
    </button>
  );
}

export function VoiceCuePanel({ cue, expanded, onToggle, onChange }: VoiceCuePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const asset = cue.voiceAssetRef ? getUserAsset(cue.voiceAssetRef) : null;
  const source = cue.voiceAssetRef ? resolveAudio(cue.voiceAssetRef) : null;
  const startMs = cue.voiceStartMs ?? 0;

  useEffect(() => {
    if (!expanded || !cue.voiceAssetRef) {
      return;
    }
    let cancelled = false;
    const context = new AudioContext();
    void (async () => {
      try {
        const blob =
          (await readUserAssetBlob(cue.voiceAssetRef!)) ??
          (source ? await fetch(source).then((item) => item.blob()) : null);
        if (!blob) {
          throw new Error("找不到语音文件");
        }
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        if (cancelled) {
          return;
        }
        setDurationMs(Math.round(decoded.duration * 1000));
        drawWaveform(canvasRef.current, decoded);
        setError(null);
      } catch {
        if (!cancelled) {
          setError("波形加载失败");
        }
      } finally {
        void context.close();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cue.voiceAssetRef, expanded, source]);

  const stopPreview = useCallback(() => {
    const audio = previewRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    previewRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewing(false);
  }, []);

  useEffect(() => {
    stopPreview();
    return () => {
      stopPreview();
    };
  }, [cue.voiceAssetRef, expanded, startMs, stopPreview]);

  const playPreviewOnce = async () => {
    if (!cue.voiceAssetRef) {
      return;
    }
    if (previewing) {
      stopPreview();
      return;
    }
    try {
      const blob =
        (await readUserAssetBlob(cue.voiceAssetRef)) ??
        (source ? await fetch(source).then((item) => item.blob()) : null);
      if (!blob) {
        throw new Error("找不到语音文件");
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewUrlRef.current = url;
      previewRef.current = audio;
      audio.addEventListener("ended", stopPreview);
      audio.addEventListener("error", () => {
        setError("试听失败");
        stopPreview();
      });
      audio.currentTime = startMs / 1000;
      await audio.play();
      setPreviewing(true);
      setError(null);
    } catch {
      setError("试听失败");
      stopPreview();
    }
  };

  if (!expanded) {
    return null;
  }

  return (
    <div className="voice-submenu" onClick={(event) => event.stopPropagation()}>
      <div className="voice-submenu-head">
        <strong>{asset?.name ?? "未选择音频"}</strong>
        <div className="voice-submenu-actions">
          <button onClick={() => inputRef.current?.click()} type="button">
            {busy ? "导入中…" : "选择语音"}
          </button>
          {cue.voiceAssetRef ? (
            <button onClick={() => void playPreviewOnce()} type="button">
              {previewing ? "停止" : "试听一次"}
            </button>
          ) : null}
          {cue.voiceAssetRef ? (
            <button
              onClick={() => {
                stopPreview();
                onChange({ voiceAssetRef: undefined, voiceStartMs: undefined });
                setDurationMs(0);
              }}
              type="button"
            >
              清除
            </button>
          ) : null}
          <button onClick={onToggle} type="button">
            收起
          </button>
        </div>
      </div>
      <input
        accept="audio/*,.aac,.flac,.m4a,.mp3,.ogg,.opus,.wav"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) {
            return;
          }
          setBusy(true);
          setError(null);
          void importUserAsset(file, ["audio"])
            .then((assetRef) => onChange({ voiceAssetRef: assetRef, voiceStartMs: 0 }))
            .catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : "语音导入失败");
            })
            .finally(() => setBusy(false));
        }}
        ref={inputRef}
        type="file"
      />
      <canvas className="voice-waveform" height={56} ref={canvasRef} width={640} />
      <label className="voice-start">
        <span>起始点 {formatTime(startMs)}</span>
        <input
          disabled={!source}
          max={Math.max(durationMs, startMs)}
          min={0}
          onChange={(event) => onChange({ voiceStartMs: Number(event.currentTarget.value) })}
          type="range"
          value={startMs}
        />
      </label>
      {error ? <p className="voice-error">{error}</p> : null}
    </div>
  );
}

function formatTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${seconds}`;
}

function drawWaveform(canvas: HTMLCanvasElement | null, buffer: AudioBuffer): void {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const samples = buffer.getChannelData(0);
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(78, 183, 216, 0.18)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#7dd4ef";
  context.lineWidth = 1;
  context.beginPath();
  const step = Math.max(1, Math.floor(samples.length / width));
  for (let x = 0; x < width; x += 1) {
    let min = 1;
    let max = -1;
    const start = x * step;
    for (let index = 0; index < step && start + index < samples.length; index += 1) {
      const value = samples[start + index] ?? 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const yMin = ((min + 1) / 2) * height;
    const yMax = ((max + 1) / 2) * height;
    context.moveTo(x + 0.5, yMin);
    context.lineTo(x + 0.5, yMax);
  }
  context.stroke();
}
