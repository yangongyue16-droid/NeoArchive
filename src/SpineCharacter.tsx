import { createGlowLayers } from "./effects/GlowLayers";
import { createCharacterFilter } from "./effects/CharacterFilter";
import {
  isHaloSlot,
  normalizeCharacterEffect,
  type CharacterEffect,
} from "./effects/characterSettings";
import { useEffect, useRef, useState } from "react";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Application, Assets } from "pixi.js";

type SpineCharacterProps = {
  effect?: CharacterEffect | null;
  animationName?: string;
  enterDurationMs: number;
  onEnterComplete?: () => void;
  positionXPercent: number;
  positionYPercent: number;
  scalePercent: number;
  skeletonUrl: string;
};

export function SpineCharacter({
  effect,
  animationName,
  enterDurationMs,
  onEnterComplete,
  positionXPercent,
  positionYPercent,
  scalePercent,
  skeletonUrl,
}: SpineCharacterProps) {
  const effectRef = useRef(effect);
  effectRef.current = effect;
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
    let glowLayers: ReturnType<typeof createGlowLayers> | null = null;
    let glowBody: Spine | null = null;
    let glowHalo: Spine | null = null;
    let characterFilter: ReturnType<typeof createCharacterFilter> | null = null;
    let updateCharacterEffect: (() => void) | undefined;
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

    const captureFrame = () => {
      if (!disposed && initialized) app?.render();
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
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let effectTime = 0;
      updateCharacterEffect = () => {
        const settings = normalizeCharacterEffect(effectRef.current);
        const seconds = Math.min(nextApp.ticker.deltaMS, 50) / 1000;
        if (settings?.kind === "glow" && !motion.matches) {
          if (characterFilter) {
            character.filters = [];
            characterFilter.destroy();
            characterFilter = null;
          }
          if (!glowLayers) {
            const makeLayer = (halo: boolean) => {
              const layer = Spine.from({
                skeleton: skeletonAlias,
                atlas: atlasAlias,
                autoUpdate: true,
              });
              if (animation) {
                const track = layer.state.setAnimation(0, animation.name, true);
                track.trackTime = character.state.getCurrent(0)?.trackTime ?? 0;
              }
              layer.afterUpdateWorldTransforms = (spine) => {
                for (const slot of spine.skeleton.slots)
                  if (isHaloSlot(slot) !== halo) slot.color.a = 0;
              };
              layer.update(0);
              nextApp.stage.addChildAt(layer, 0);
              return layer;
            };
            glowBody = makeLayer(false);
            glowHalo = makeLayer(true);
            glowLayers = createGlowLayers(glowBody, glowHalo);
          }
          for (const layer of [glowBody, glowHalo]) {
            layer!.position.copyFrom(character.position);
            layer!.scale.copyFrom(character.scale);
          }
          glowLayers.update(settings, seconds);
          return;
        }
        glowLayers?.update(null, seconds);
        if (!settings || settings.intensity === 0 || motion.matches) {
          if (characterFilter) {
            character.filters = [];
            characterFilter.destroy();
            characterFilter = null;
          }
          return;
        }
        if (!characterFilter) {
          characterFilter = createCharacterFilter();
          character.filters = [characterFilter.filter];
        }
        effectTime += (Math.min(nextApp.ticker.deltaMS, 50) / 1000) * settings.speed;
        characterFilter.update(settings, effectTime);
      };

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
      nextApp.ticker.add(updateCharacterEffect);
      updateCharacterEffect();
      host.appendChild(canvas);
      canvas.addEventListener("neoarchive-capture-frame", captureFrame);
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
      canvas?.removeEventListener("neoarchive-capture-frame", captureFrame);
      if (initialized) {
        if (updateCharacterEffect) app?.ticker.remove(updateCharacterEffect);
        characterFilter?.destroy();
        glowLayers?.destroy();
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
