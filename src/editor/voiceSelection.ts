/** Keep a non-empty selection and let the boundary being edited take precedence. */
export function voiceBoundaryPatch(
  boundary: "start" | "end",
  value: number,
  durationMs: number,
  startMs: number,
  endMs?: number,
): { voiceStartMs?: number; voiceEndMs?: number } {
  const duration = Math.max(1, Math.round(durationMs));
  const next = Math.round(Number.isFinite(value) ? value : 0);
  if (boundary === "start") {
    const start = Math.min(duration - 1, Math.max(0, next));
    return endMs !== undefined && start >= endMs
      ? { voiceStartMs: start, voiceEndMs: start + 1 }
      : { voiceStartMs: start };
  }
  const end = Math.min(duration, Math.max(1, next));
  return end <= startMs ? { voiceEndMs: end, voiceStartMs: end - 1 } : { voiceEndMs: end };
}
