import { useEffect, useRef, useState } from "react";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Application, Assets } from "pixi.js";

type SpineCharacterProps = {
  animationName?: string;
  enterDurationMs: number;
  onEnterComplete?: () => void;
  positionXPercent: number;
  positionYPercent: number;
  scalePercent: number;
  skeletonUrl: string;
};

export function SpineCharacter({
  animationName,
  enterDurationMs,
  onEnterComplete,
  positionXPercent,
  positionYPercent,
  scalePercent,
  skeletonUrl,
}: SpineCharacterProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitCharacterRef = useRef<(() => void) | null>(null);
  const onEnterCompleteRef = useRef(onEnterComplete);
  const placementRef = useRef({ positionXPercent, positionYPercent, scalePercent });
  const [error, setError] = useState<string | null>(null);

  placementRef.current = { positionXPercent, positionYPercent, scalePercent };
  onEnterCompleteRef.current = onEnterComplete;

  useEffect(() => {
    fitCharacterRef.current?.();
  }, [positionXPercent, positionYPercent, scalePercent]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let app: Application | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let disposed = false;
    let initialized = false;
    let resizeObserver: ResizeObserver | undefined;
    let revealFrame = 0;
    let settleFrame = 0;
    let entryCompleted = false;
    const atlasUrl = skeletonUrl.replace(/\.skel$/, ".atlas");
    const skeletonAlias = `spine-skeleton:${skeletonUrl}`;
    const atlasAlias = `spine-atlas:${atlasUrl}`;

    const completeEntry = () => {
      if (entryCompleted || disposed) {
        return;
      }
      entryCompleted = true;
      onEnterCompleteRef.current?.();
    };

    const initialize = async () => {
      const nextApp = new Application();
      app = nextApp;
      await nextApp.init({
        antialias: true,
        backgroundAlpha: 0,
        resizeTo: host,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        preference: "webgl",
      });
      initialized = true;

      if (disposed) {
        nextApp.destroy(true, { children: true });
        return;
      }

      canvas = nextApp.canvas;
      canvas.className = "spine-canvas";
      canvas.style.animationDuration = `${enterDurationMs}ms`;
      canvas.addEventListener("animationend", completeEntry, { once: true });

      if (!Assets.resolver.hasKey(skeletonAlias)) {
        Assets.add({ alias: skeletonAlias, src: skeletonUrl });
      }
      if (!Assets.resolver.hasKey(atlasAlias)) {
        Assets.add({ alias: atlasAlias, src: atlasUrl });
      }
      await Assets.load([skeletonAlias, atlasAlias]);

      if (disposed) {
        return;
      }

      const character = Spine.from({
        skeleton: skeletonAlias,
        atlas: atlasAlias,
        autoUpdate: true,
      });
      const animation =
        character.skeleton.data.animations.find(({ name }) => name === animationName) ??
        character.skeleton.data.animations[0];

      if (animation) {
        character.state.setAnimation(0, animation.name, true);
      }
      character.update(0);

      const fitCharacter = () => {
        const { height, width } = nextApp.renderer;
        const placement = placementRef.current;
        character.scale.set(1);
        const bounds = character.getLocalBounds();
        const baseScale = (height * 0.94) / bounds.height;
        const scale = (baseScale * placement.scalePercent) / 100;
        character.scale.set(scale);
        character.position.set(
          (width * placement.positionXPercent) / 100 - (bounds.x + bounds.width * 0.5) * scale,
          (height * placement.positionYPercent) / 100 - (bounds.y + bounds.height * 0.5) * scale,
        );
      };

      fitCharacterRef.current = fitCharacter;
      fitCharacter();
      nextApp.stage.addChild(character);
      host.appendChild(canvas);
      resizeObserver = new ResizeObserver(fitCharacter);
      resizeObserver.observe(host);

      // Render a stable Spine frame while the canvas is still hidden. Revealing
      // the canvas earlier can expose its empty WebGL buffer or pre-fit pose.
      nextApp.render();
      revealFrame = window.requestAnimationFrame(() => {
        fitCharacter();
        nextApp.render();
        settleFrame = window.requestAnimationFrame(() => {
          if (disposed) {
            return;
          }

          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (reduceMotion || enterDurationMs <= 0) {
            canvas?.classList.add("is-entry-complete");
            completeEntry();
            return;
          }
          canvas?.classList.add("is-entry-ready");
        });
      });
    };

    void initialize().catch((reason: unknown) => {
      if (!disposed) {
        const detail = reason instanceof Error ? reason.message : String(reason);
        console.error("Failed to load Sakurako Spine assets", reason);
        setError(`Sakurako Spine 资源加载失败：${detail}`);
        onEnterCompleteRef.current?.();
      }
    });

    return () => {
      disposed = true;
      fitCharacterRef.current = null;
      window.cancelAnimationFrame(revealFrame);
      window.cancelAnimationFrame(settleFrame);
      resizeObserver?.disconnect();
      canvas?.removeEventListener("animationend", completeEntry);
      if (initialized) {
        app?.destroy(true, { children: true, texture: false, textureSource: false });
      }
    };
  }, [animationName, enterDurationMs, skeletonUrl]);

  return (
    <div className="spine-character" ref={hostRef}>
      {error ? (
        <div className="asset-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
