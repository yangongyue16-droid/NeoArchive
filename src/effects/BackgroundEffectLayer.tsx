import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { BackgroundFit } from "../project-schema/types";
import { loadEffectEngine, type EffectEngine } from "./engine";
import { createMediaCapture } from "./mediaTexture";
import type { BackgroundEffect } from "./settings";

const motionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const subscribeMotion = (callback: () => void) => {
  const query = motionQuery();
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};

export function BackgroundEffectLayer({
  settings,
  sourceKey,
  stageRef,
  fit,
}: {
  settings: BackgroundEffect;
  sourceKey: number;
  stageRef: RefObject<HTMLElement | null>;
  fit: BackgroundFit;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EffectEngine | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => motionQuery().matches,
    () => false,
  );
  const kind = settings.kind;
  const coverDialogue = settings.coverDialogue === true;
  const enabled = settings.intensity > 0 && !reducedMotion;

  useEffect(() => {
    setError(null);
    if (!enabled) return;
    const output = canvasRef.current;
    const content = stageRef.current;
    const media = content?.querySelector<HTMLImageElement | HTMLVideoElement>(".stage-background");
    if (!output || !content || !media) return;
    const source = document.createElement("canvas");
    const capture = createMediaCapture(media, fit, coverDialogue ? content : undefined);
    let disposed = false;
    let initialized = false;
    let instance: EffectEngine | null = null;
    const release = () => {
      instance?.destroy();
      instance = null;
      engineRef.current = null;
    };
    const fail = (reason: unknown) => {
      if (disposed) return;
      output.style.visibility = "hidden";
      setError(
        reason instanceof DOMException && reason.name === "SecurityError"
          ? "此素材不允许跨域特效"
          : "特效不可用，已保留原画面",
      );
      // Release after the current engine callback has returned.
      queueMicrotask(() => {
        if (!disposed) release();
      });
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      fail(new Error("WebGL context lost"));
    };
    output.addEventListener("webglcontextlost", onContextLost);
    void loadEffectEngine(kind)
      .then((create) => {
        if (disposed) return;
        output.style.visibility = "visible";
        initialized = true;
        instance = create(
          {
            source,
            content,
            output,
            capture,
            onError: fail,
            continuous: coverDialogue || media instanceof HTMLVideoElement,
          },
          settingsRef.current,
        );
        engineRef.current = instance;
        if (!instance) fail(new Error("WebGL2 unavailable"));
      })
      .catch(fail);
    return () => {
      disposed = true;
      output.removeEventListener("webglcontextlost", onContextLost);
      release();
      capture.destroy();
      // Each mount owns its canvas, so retired contexts can be explicitly released.
      if (initialized)
        output.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      source.width = 1;
      source.height = 1;
    };
  }, [coverDialogue, enabled, fit, kind, sourceKey, stageRef]);

  useEffect(() => {
    engineRef.current?.update(settings);
  }, [settings]);

  return (
    <>
      {enabled ? (
        <canvas
          key={`${kind}:${sourceKey}:${fit}:${coverDialogue}`}
          ref={canvasRef}
          className={`background-effect-canvas ${coverDialogue ? "covers-dialogue" : ""}`}
          data-effect={kind}
          aria-hidden="true"
        />
      ) : null}
      {error || reducedMotion ? (
        <span className="background-effect-status" role="status">
          {reducedMotion ? "已按减少动态效果设置停用特效" : error}
        </span>
      ) : null}
    </>
  );
}
