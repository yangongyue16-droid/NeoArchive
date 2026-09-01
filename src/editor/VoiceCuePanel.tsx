import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { resolveAudio } from "../assets/catalog";
import { getUserAsset, importUserAsset, readUserAssetBlob } from "../assets/userAssets";
import type { DialogueShowCue } from "../project-schema/types";

type VoiceCuePanelProps = {
  cue: DialogueShowCue;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onChange: (patch: { voiceAssetRef?: string; voiceStartMs?: number; voiceEndMs?: number }) => void;
};

type Transport = "idle" | "playing" | "paused";

const WAVEFORM_WIDTH = 640;
const OVERVIEW_HEIGHT = 40;
const DETAIL_HEIGHT = 56;
const PIXELS_PER_SECOND = 80;
const DETAIL_WINDOW_MS = 4000;

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

export function VoiceCuePanel({ cue, expanded, selected, onToggle, onChange }: VoiceCuePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const overviewRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const overviewWrapRef = useRef<HTMLDivElement>(null);
  const detailWrapRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const peaksRef = useRef<Float32Array | null>(null);
  const transportRef = useRef<Transport>("idle");
  const playheadRef = useRef(0);
  const focusRef = useRef(0);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transport, setTransport] = useState<Transport>("idle");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [focusMs, setFocusMs] = useState(0);
  const asset = cue.voiceAssetRef ? getUserAsset(cue.voiceAssetRef) : null;
  const source = cue.voiceAssetRef ? resolveAudio(cue.voiceAssetRef) : null;
  const startMs = cue.voiceStartMs ?? 0;
  const endMs = cue.voiceEndMs ?? durationMs;
  const hasCutEnd = cue.voiceEndMs !== undefined;
  const windowRange = visibleWindow(focusMs, durationMs);
  const spanMs = Math.max(durationMs, 1);
  const startPct = (startMs / spanMs) * 100;
  const endPct = (endMs / spanMs) * 100;
  const playheadPct = (playheadMs / spanMs) * 100;
  const windowLeftPct = (windowRange.start / spanMs) * 100;
  const windowWidthPct = ((windowRange.end - windowRange.start) / spanMs) * 100;
  const detailSpan = Math.max(windowRange.end - windowRange.start, 1);
  const detailStartPct = ((startMs - windowRange.start) / detailSpan) * 100;
  const detailEndPct = ((endMs - windowRange.start) / detailSpan) * 100;
  const detailPlayheadPct = ((playheadMs - windowRange.start) / detailSpan) * 100;

  const setTransportState = (next: Transport) => {
    transportRef.current = next;
    setTransport(next);
  };

  const setPlayhead = (ms: number) => {
    const next = clampMs(ms, durationMs);
    playheadRef.current = next;
    setPlayheadMs(next);
    return next;
  };

  const setFocus = (ms: number) => {
    const next = clampMs(ms, durationMs);
    focusRef.current = next;
    setFocusMs(next);
    return next;
  };

  const paint = useCallback(
    (
      nextStartMs = startMs,
      nextFocusMs = focusRef.current,
      nextPlayheadMs = playheadRef.current,
    ) => {
      const peaks = peaksRef.current;
      const range = visibleWindow(nextFocusMs, durationMs);
      const endPointMs = cue.voiceEndMs ?? null;
      drawOverviewWaveform(overviewRef.current, peaks, nextStartMs, durationMs, endPointMs);
      drawDetailWaveform(
        detailRef.current,
        peaks,
        range.start,
        range.end,
        nextStartMs,
        nextPlayheadMs,
        endPointMs,
      );
    },
    [cue.voiceEndMs, durationMs, startMs],
  );

  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);

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
        const peaks = buildPeaks(decoded);
        const nextDuration = Math.round(decoded.duration * 1000);
        peaksRef.current = peaks;
        setDurationMs(nextDuration);
        const initialFocus = clampMs(cue.voiceStartMs ?? 0, nextDuration);
        focusRef.current = initialFocus;
        setFocusMs(initialFocus);
        playheadRef.current = initialFocus;
        setPlayheadMs(initialFocus);
        const endPointMs = cue.voiceEndMs ?? null;
        drawOverviewWaveform(
          overviewRef.current,
          peaks,
          cue.voiceStartMs ?? 0,
          nextDuration,
          endPointMs,
        );
        const range = visibleWindow(initialFocus, nextDuration);
        drawDetailWaveform(
          detailRef.current,
          peaks,
          range.start,
          range.end,
          cue.voiceStartMs ?? 0,
          initialFocus,
          endPointMs,
        );
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

  const disposeAudio = useCallback(() => {
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
  }, []);

  const stopPreview = useCallback(() => {
    disposeAudio();
    setTransportState("idle");
    setPlayhead(startMs);
    paint(startMs, focusRef.current, startMs);
  }, [disposeAudio, paint, startMs]);

  useEffect(() => {
    disposeAudio();
    setTransportState("idle");
    return () => {
      disposeAudio();
    };
  }, [cue.voiceAssetRef, disposeAudio, expanded, selected]);

  useEffect(() => {
    paint();
  }, [paint, startMs, focusMs]);

  useEffect(() => {
    if (transport !== "playing") {
      return;
    }
    let frame = 0;
    const tick = () => {
      const audio = previewRef.current;
      if (audio) {
        setPlayhead(Math.round(audio.currentTime * 1000));
        paint(startMs, focusRef.current, playheadRef.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paint, startMs, transport]);

  const ensureAudio = async () => {
    if (previewRef.current) {
      return previewRef.current;
    }
    if (!cue.voiceAssetRef) {
      throw new Error("找不到语音文件");
    }
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
    audio.addEventListener("ended", () => {
      stopPreview();
    });
    audio.addEventListener("error", () => {
      setError("试听失败");
      stopPreview();
    });
    return audio;
  };

  const playFrom = async (ms: number) => {
    try {
      const audio = await ensureAudio();
      audio.currentTime = setPlayhead(ms) / 1000;
      await audio.play();
      setTransportState("playing");
      setError(null);
    } catch {
      setError("试听失败");
      stopPreview();
    }
  };

  const pausePreview = () => {
    previewRef.current?.pause();
    setTransportState("paused");
    paint();
  };

  const seekPlayhead = (ms: number) => {
    const next = setPlayhead(ms);
    if (previewRef.current) {
      previewRef.current.currentTime = next / 1000;
    }
    paint(startMs, focusRef.current, next);
  };

  const timeFromOverviewX = (clientX: number) => {
    const rect = overviewWrapRef.current?.getBoundingClientRect();
    if (!rect || durationMs <= 0) {
      return 0;
    }
    return ((clientX - rect.left) / rect.width) * durationMs;
  };

  const timeFromDetailX = (clientX: number) => {
    const rect = detailWrapRef.current?.getBoundingClientRect();
    if (!rect || durationMs <= 0) {
      return startMs;
    }
    const range = visibleWindow(focusRef.current, durationMs);
    return range.start + ((clientX - rect.left) / rect.width) * (range.end - range.start);
  };

  const onOverviewPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!cue.voiceAssetRef || durationMs <= 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = timeFromOverviewX(event.clientX);
    setFocus(next);
    seekPlayhead(next);
  };

  const onOverviewPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const next = timeFromOverviewX(event.clientX);
    setFocus(next);
    seekPlayhead(next);
  };

  // 波形空白区域：只认「按住拖动」，单击不改变任何值。
  const detailDragRef = useRef<{ moved: boolean; downX: number } | null>(null);

  const onDetailPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!cue.voiceAssetRef || durationMs <= 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    detailDragRef.current = { moved: false, downX: event.clientX };
  };

  const onDetailPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const drag = detailDragRef.current;
    if (!drag) {
      return;
    }
    if (!drag.moved && Math.abs(event.clientX - drag.downX) < 6) {
      return;
    }
    drag.moved = true;
    const next = clampMs(timeFromDetailX(event.clientX), durationMs);
    seekPlayhead(next);
    onChange({ voiceStartMs: next });
  };

  const onDetailPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    detailDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // 拖终点：终点自由设置；若拖到起点之前，起点自动跟到同一点（后者说了算）。
  const updateEndFromX = (clientX: number) => {
    const value = clampMs(timeFromDetailX(clientX), durationMs);
    const patch: { voiceEndMs: number; voiceStartMs?: number } = { voiceEndMs: value };
    if (value < startMs) {
      patch.voiceStartMs = value;
    }
    onChange(patch);
  };

  // 拖起点：起点自由设置；若超过现有终点，终点自动跟到同一点。
  const updateStartFromX = (clientX: number) => {
    const value = clampMs(timeFromDetailX(clientX), durationMs);
    const patch: { voiceStartMs: number; voiceEndMs?: number } = { voiceStartMs: value };
    if (hasCutEnd && value > endMs) {
      patch.voiceEndMs = value;
    }
    onChange(patch);
    seekPlayhead(value);
  };

  const onStartPointPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (!cue.voiceAssetRef || durationMs <= 0) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragKindRef.current = "start";
    dragMovedRef.current = false;
    dragDownXRef.current = event.clientX;
  };

  const onStartPointPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    event.stopPropagation();
    if (!dragMovedRef.current && Math.abs(event.clientX - dragDownXRef.current) < 4) {
      return;
    }
    dragMovedRef.current = true;
    updateStartFromX(event.clientX);
  };

  // 只有真正拖动了才改变值：按下只做准备，移动超过阈值才算拖动。
  const dragKindRef = useRef<"start" | "end" | null>(null);
  const dragMovedRef = useRef(false);
  const dragDownXRef = useRef(0);

  const onEndPointPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (!cue.voiceAssetRef || durationMs <= 0) {
      return;
    }
    // 阻止冒泡：外面的细分区「点击=设起点」不得抢走把手的事件捕获。
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragKindRef.current = "end";
    dragMovedRef.current = false;
    dragDownXRef.current = event.clientX;
  };

  const onEndPointPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    event.stopPropagation();
    if (!dragMovedRef.current && Math.abs(event.clientX - dragDownXRef.current) < 4) {
      return;
    }
    dragMovedRef.current = true;
    updateEndFromX(event.clientX);
  };

  const onEndPointPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    const wasDragged = dragMovedRef.current;
    dragKindRef.current = null;
    if (wasDragged) {
      const value = clampMs(timeFromDetailX(event.clientX), durationMs);
      // 拖到最右（音频末尾）松手 = 复位终点，回到「播到全长」。
      if (value >= durationMs - 40) {
        onChange({ voiceEndMs: undefined });
      }
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onStartPointPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    const wasDragged = dragMovedRef.current;
    dragKindRef.current = null;
    if (wasDragged) {
      const value = clampMs(timeFromDetailX(event.clientX), durationMs);
      // 拖到最左（0）松手 = 复位起点。
      if (value <= 40) {
        onChange({ voiceStartMs: 0 });
      }
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
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
            <>
              <button
                onClick={() => void playFrom(transport === "paused" ? playheadMs : startMs)}
                type="button"
              >
                {transport === "paused" ? "继续" : "试听"}
              </button>
              <button disabled={transport !== "playing"} onClick={pausePreview} type="button">
                暂停
              </button>
              <button disabled={transport === "idle"} onClick={stopPreview} type="button">
                停止
              </button>
            </>
          ) : null}
          {cue.voiceAssetRef ? (
            <button
              onClick={() => {
                disposeAudio();
                setTransportState("idle");
                onChange({
                  voiceAssetRef: undefined,
                  voiceStartMs: undefined,
                  voiceEndMs: undefined,
                });
                setDurationMs(0);
                peaksRef.current = null;
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
      <div className="voice-lane">
        <span>
          总览 · 预览 {formatTime(playheadMs)} / {formatTime(durationMs)}
        </span>
        <div
          className="voice-waveform-wrap is-overview"
          onPointerDown={onOverviewPointerDown}
          onPointerMove={onOverviewPointerMove}
          ref={overviewWrapRef}
        >
          <canvas
            className="voice-waveform"
            height={OVERVIEW_HEIGHT}
            ref={overviewRef}
            width={WAVEFORM_WIDTH}
          />
          {cue.voiceAssetRef ? (
            <>
              <span
                className="voice-waveform-window"
                style={{ left: `${windowLeftPct}%`, width: `${windowWidthPct}%` }}
              />
              <span className="voice-waveform-origin" style={{ left: `${startPct}%` }} />
              <span className="voice-waveform-endspan" style={{ left: `${endPct}%` }} />
              <span className="voice-waveform-playhead" style={{ left: `${playheadPct}%` }} />
            </>
          ) : null}
        </div>
      </div>
      <div className="voice-lane">
        <span>
          细分 · 成片起点 {formatTime(startMs)} · 成片终点{" "}
          {formatTime(hasCutEnd ? endMs : durationMs)}
          {" · "}窗口 {formatTime(windowRange.start)}–{formatTime(windowRange.end)}
        </span>
        <div
          className="voice-waveform-wrap is-detail"
          onPointerDown={onDetailPointerDown}
          onPointerMove={onDetailPointerMove}
          onPointerUp={onDetailPointerUp}
          onPointerCancel={onDetailPointerUp}
          ref={detailWrapRef}
        >
          <canvas
            className="voice-waveform"
            height={DETAIL_HEIGHT}
            ref={detailRef}
            width={WAVEFORM_WIDTH}
          />
          {cue.voiceAssetRef ? (
            <>
              <span
                className="voice-waveform-originpoint"
                onPointerDown={onStartPointPointerDown}
                onPointerMove={onStartPointPointerMove}
                onPointerUp={onStartPointPointerUp}
                style={{ left: `${clampPct(detailStartPct)}%` }}
              />
              <span
                className="voice-waveform-endpoint"
                onPointerDown={onEndPointPointerDown}
                onPointerMove={onEndPointPointerMove}
                onPointerUp={onEndPointPointerUp}
                style={{ left: `${clampPct(detailEndPct)}%` }}
              />
              <span
                className="voice-waveform-playhead"
                style={{ left: `${clampPct(detailPlayheadPct)}%` }}
              />
            </>
          ) : null}
        </div>
      </div>
      {cue.voiceAssetRef ? (
        <div className="voice-submenu-actions">
          <button onClick={() => onChange({ voiceStartMs: playheadMs })} type="button">
            设为成片起点
          </button>
          <button
            onClick={() => {
              setFocus(0);
              onChange({ voiceStartMs: 0 });
            }}
            type="button"
          >
            复位起点
          </button>
          <button onClick={() => onChange({ voiceEndMs: playheadMs })} type="button">
            设为成片终点
          </button>
          {hasCutEnd ? (
            <button onClick={() => onChange({ voiceEndMs: undefined })} type="button">
              复位终点
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="voice-error">{error}</p> : null}
    </div>
  );
}

function clampMs(ms: number, durationMs: number): number {
  const max = Math.max(durationMs, 0);
  return Math.min(max, Math.max(0, Math.round(ms)));
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function visibleWindow(focusMs: number, durationMs: number): { start: number; end: number } {
  if (durationMs <= 0) {
    return { start: 0, end: DETAIL_WINDOW_MS };
  }
  const windowMs = Math.min(DETAIL_WINDOW_MS, durationMs);
  let start = focusMs - windowMs / 2;
  let end = start + windowMs;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > durationMs) {
    start -= end - durationMs;
    end = durationMs;
  }
  return { start: Math.max(0, start), end };
}

function formatTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${seconds}`;
}

function buildPeaks(buffer: AudioBuffer): Float32Array {
  const samples = buffer.getChannelData(0);
  const totalPeaks = Math.max(1, Math.ceil((buffer.duration * PIXELS_PER_SECOND) / 0.5));
  const peaks = new Float32Array(totalPeaks);
  const step = Math.max(1, Math.floor(samples.length / totalPeaks));
  for (let index = 0; index < totalPeaks; index += 1) {
    let max = 0;
    const start = index * step;
    for (let offset = 0; offset < step && start + offset < samples.length; offset += 1) {
      max = Math.max(max, Math.abs(samples[start + offset] ?? 0));
    }
    peaks[index] = max;
  }
  return peaks;
}

function peakAt(peaks: Float32Array, timeMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }
  const index = Math.min(
    peaks.length - 1,
    Math.max(0, Math.floor((timeMs / durationMs) * peaks.length)),
  );
  return peaks[index] ?? 0;
}

function fillWave(
  context: CanvasRenderingContext2D,
  peaks: Float32Array,
  durationMs: number,
  startMs: number,
  endMs: number,
  inPointMs: number,
  playheadMs: number | null,
  endPointMs: number | null,
): void {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const mid = height / 2;
  const span = Math.max(endMs - startMs, 1);
  for (let x = 0; x < width; x += 1) {
    const timeMs = startMs + (x / width) * span;
    const amplitude = Math.max(2, peakAt(peaks, timeMs, durationMs) * (height * 0.86));
    const beforeIn = timeMs < inPointMs;
    const beforePlay = playheadMs !== null && timeMs < playheadMs;
    const afterCut = endPointMs !== null && timeMs > endPointMs;
    context.fillStyle = beforeIn
      ? "rgba(125, 212, 239, 0.2)"
      : afterCut
        ? "rgba(125, 212, 239, 0.14)"
        : beforePlay
          ? "rgba(125, 212, 239, 0.95)"
          : "rgba(125, 212, 239, 0.72)";
    context.fillRect(x, mid - amplitude / 2, 1, amplitude);
  }
}

function drawOverviewWaveform(
  canvas: HTMLCanvasElement | null,
  peaks: Float32Array | null,
  startMs: number,
  durationMs: number,
  endPointMs: number | null,
): void {
  if (!canvas || !peaks) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(78, 183, 216, 0.12)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  fillWave(context, peaks, durationMs, 0, durationMs, startMs, null, endPointMs);
}

function drawDetailWaveform(
  canvas: HTMLCanvasElement | null,
  peaks: Float32Array | null,
  startMs: number,
  endMs: number,
  inPointMs: number,
  playheadMs: number,
  endPointMs: number | null,
): void {
  if (!canvas || !peaks) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const durationMs = (peaks.length * 0.5 * 1000) / PIXELS_PER_SECOND;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(78, 183, 216, 0.12)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  fillWave(context, peaks, durationMs, startMs, endMs, inPointMs, playheadMs, endPointMs);
}
