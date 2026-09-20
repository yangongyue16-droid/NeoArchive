import { useEffect, useRef, useState } from "react";
import { Application, Sprite, Texture } from "pixi.js";
import { getUserAsset } from "../assets/userAssets";
import { createCharacterFilter } from "../effects/CharacterFilter";
import { createGlowLayers } from "../effects/GlowLayers";
import { normalizeCharacterEffect, type CharacterEffect } from "../effects/characterSettings";
import { loadCharacterImage, makeMaskedImages } from "../effects/haloMask";

export function ImageCharacter({
  url,
  effect,
  x,
  y,
  scale,
  enterDurationMs,
  onEnterComplete,
}: {
  url: string;
  effect?: CharacterEffect | null;
  x: number;
  y: number;
  scale: number;
  enterDurationMs: number;
  onEnterComplete: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ effect, x, y, scale, onEnterComplete });
  latest.current = { effect, x, y, scale, onEnterComplete };
  const [error, setError] = useState<string | null>(null);
  const maskRef = effect?.haloMask?.assetRef;
  const maskUrl = effect?.haloMask?.assetRef
    ? getUserAsset(effect.haloMask.assetRef)?.url
    : undefined;
  const invert = effect?.haloMask?.invert === true;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setError(null);
    let disposed = false;
    let ready = false;
    let complete = false;
    let frame = 0;
    let observer: ResizeObserver | undefined;
    let glow: ReturnType<typeof createGlowLayers> | undefined;
    let filter: ReturnType<typeof createCharacterFilter> | undefined;
    let ownedTextures: Texture[] = [];
    const app = new Application();
    const finish = () => {
      if (!complete && !disposed) {
        complete = true;
        latest.current.onEnterComplete();
      }
    };
    const capture = () => {
      if (ready && !disposed) app.render();
    };
    void (async () => {
      await app.init({
        antialias: true,
        backgroundAlpha: 0,
        resizeTo: host,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: "webgl",
      });
      ready = true;
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      const image = await loadCharacterImage(url);
      if (disposed) return;
      const texture = Texture.from(image);
      ownedTextures.push(texture);
      let partTextures = [texture, Texture.EMPTY];
      if (maskRef && !maskUrl) {
        setError("蒙版不可用，已保留原立绘");
        partTextures = [Texture.EMPTY, Texture.EMPTY];
      }
      if (maskUrl) {
        try {
          const mask = await loadCharacterImage(maskUrl);
          if (disposed) return;
          const parts = makeMaskedImages(image, mask, invert);
          partTextures = parts.map((part) => Texture.from(part));
          ownedTextures.push(...partTextures);
        } catch {
          if (disposed) return;
          setError("蒙版读取失败，已保留原立绘");
          partTextures = [Texture.EMPTY, Texture.EMPTY];
        }
      }
      const original = new Sprite(texture);
      const body = new Sprite(partTextures[0]);
      const halo = new Sprite(partTextures[1]);
      glow = createGlowLayers(body, halo);
      app.stage.addChild(body, halo, original);
      const fit = () => {
        const p = latest.current;
        const factor = ((app.renderer.height * 0.94) / image.naturalHeight) * p.scale;
        for (const item of [original, body, halo]) {
          item.scale.set(factor);
          item.position.set(
            app.renderer.width * p.x - (image.naturalWidth * factor) / 2,
            app.renderer.height * p.y - (image.naturalHeight * factor) / 2,
          );
        }
      };
      let time = 0;
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => {
        fit();
        const settings = motion.matches ? null : normalizeCharacterEffect(latest.current.effect);
        const seconds = Math.min(app.ticker.deltaMS, 50) / 1000;
        glow?.update(settings?.kind === "glow" ? settings : null, seconds);
        if (settings && settings.kind !== "glow" && settings.intensity > 0) {
          if (!filter) {
            filter = createCharacterFilter();
            original.filters = [filter.filter];
          }
          time += seconds * settings.speed;
          filter.update(settings, time);
        } else if (filter) {
          original.filters = [];
          filter.destroy();
          filter = undefined;
        }
      };
      update();
      app.ticker.add(update);
      const canvas = app.canvas;
      canvas.className = "spine-canvas";
      canvas.style.animationDuration = `${enterDurationMs}ms`;
      canvas.addEventListener("animationend", finish, { once: true });
      canvas.addEventListener("neoarchive-capture-frame", capture);
      host.appendChild(canvas);
      observer = new ResizeObserver(fit);
      observer.observe(host);
      app.render();
      frame = requestAnimationFrame(() => {
        if (disposed) return;
        if (motion.matches || enterDurationMs <= 0) {
          canvas.classList.add("is-entry-complete");
          finish();
        } else canvas.classList.add("is-entry-ready");
      });
    })().catch(() => {
      if (!disposed) {
        setError("立绘读取失败");
        finish();
      }
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (ready) {
        app.canvas.removeEventListener("animationend", finish);
        app.canvas.removeEventListener("neoarchive-capture-frame", capture);
        app.ticker.stop();
        glow?.destroy();
        filter?.destroy();
        app.destroy(true, { children: true, texture: false, textureSource: false });
        for (const texture of ownedTextures) texture.destroy(true);
        ownedTextures = [];
      }
    };
  }, [url, maskRef, maskUrl, invert, enterDurationMs]);
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
