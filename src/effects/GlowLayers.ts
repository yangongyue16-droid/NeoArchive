import type { Container } from "pixi.js";
import { createCharacterFilter } from "./CharacterFilter";
import { resolveHaloGlow, type CharacterEffect } from "./characterSettings";

/** Glow-only passes stay behind the untouched source art. */
export function createGlowLayers(body: Container, halo: Container) {
  const bodyFilter = createCharacterFilter(true);
  const haloFilter = createCharacterFilter(true);
  body.filters = [bodyFilter.filter];
  halo.filters = [haloFilter.filter];
  let bodyTime = 0;
  let haloTime = 0;
  return {
    update(effect: CharacterEffect | null, seconds: number) {
      body.visible = effect?.kind === "glow" && effect.intensity > 0;
      const haloEffect = effect ? resolveHaloGlow(effect) : null;
      halo.visible = !!haloEffect && haloEffect.intensity > 0;
      if (effect && body.visible) {
        bodyTime += seconds * effect.speed;
        bodyFilter.update(effect, bodyTime);
      }
      if (haloEffect && halo.visible) {
        haloTime += seconds * haloEffect.speed;
        haloFilter.update(haloEffect, haloTime);
      }
    },
    destroy() {
      body.filters = [];
      halo.filters = [];
      bodyFilter.destroy();
      haloFilter.destroy();
      body.destroy();
      halo.destroy();
    },
  };
}
