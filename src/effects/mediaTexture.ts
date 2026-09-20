import { createDialogueTexture } from "./dialogueTexture";
import type { BackgroundFit } from "../project-schema/types";

export function mediaRect(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  fit: BackgroundFit,
) {
  if (fit === "fill") return { x: 0, y: 0, width, height };
  const scale = (fit === "contain" ? Math.min : Math.max)(
    width / sourceWidth,
    height / sourceHeight,
  );
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function createMediaCapture(
  media: HTMLImageElement | HTMLVideoElement,
  fit: BackgroundFit,
  stage?: HTMLElement,
) {
  const dialogue = stage ? createDialogueTexture(stage) : null;
  let previous = "";
  const capture = (canvas: HTMLCanvasElement) => {
    const video = media instanceof HTMLVideoElement;
    const width = video ? media.videoWidth : media.naturalWidth;
    const height = video ? media.videoHeight : media.naturalHeight;
    if (width === 0 || height === 0 || (video && media.readyState < 2)) return false;
    const opacity = Number(getComputedStyle(media).opacity);
    const overlay = dialogue?.render(canvas.width, canvas.height);
    const actors = stage?.querySelectorAll<HTMLCanvasElement>(".spine-canvas");
    const fingerprint = `${media.currentSrc}:${canvas.width}:${canvas.height}:${opacity}:${video ? media.currentTime : "image"}:${overlay?.revision ?? 0}`;
    if (fingerprint === previous && !actors?.length) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建背景纹理");
    const rect = mediaRect(width, height, canvas.width, canvas.height, fit);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (stage) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.globalAlpha = opacity;
    ctx.drawImage(media, rect.x, rect.y, rect.width, rect.height);
    ctx.globalAlpha = 1;
    if (stage && overlay) {
      const bounds = stage.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        for (const actor of actors ?? []) {
          const style = getComputedStyle(actor);
          if (
            style.visibility === "hidden" ||
            Number(style.opacity) === 0 ||
            !actor.width ||
            !actor.height
          )
            continue;
          actor.dispatchEvent(new Event("neoarchive-capture-frame"));
          const rect = actor.getBoundingClientRect();
          ctx.save();
          ctx.globalAlpha = Number(style.opacity);
          ctx.drawImage(
            actor,
            ((rect.left - bounds.left) * canvas.width) / bounds.width,
            ((rect.top - bounds.top) * canvas.height) / bounds.height,
            (rect.width * canvas.width) / bounds.width,
            (rect.height * canvas.height) / bounds.height,
          );
          ctx.restore();
        }
      }
      ctx.drawImage(overlay.surface, 0, 0);
    }
    previous = fingerprint;
    return true;
  };
  return Object.assign(capture, { destroy: () => dialogue?.destroy() });
}
