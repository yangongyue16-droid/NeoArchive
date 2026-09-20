import type { BackgroundEffect } from "./settings";
import type { GlitchElements } from "./canvasui/Glitch";

export type EffectEngine = { update: (settings: BackgroundEffect) => void; destroy: () => void };

export async function loadEffectEngine(kind: BackgroundEffect["kind"]) {
  switch (kind) {
    case "shatter": {
      const { createShatter } = await import("./canvasui/Shatter");
      const options = (s: BackgroundEffect) => ({
        baseStrength: Math.min(1, s.intensity * 0.65),
        strength: Math.min(1, s.intensity),
        lift: 55 * s.intensity,
        scatter: 20 * s.intensity,
        tilt: 1.7,
        tileSize: 100,
        floatSpeed: s.speed,
        refraction: 0.75,
        dispersion: 0.15,
      });
      return (elements: GlitchElements, settings: BackgroundEffect): EffectEngine | null => {
        const instance = createShatter(elements, options(settings));
        return instance
          ? { update: (s) => instance.setOptions(options(s)), destroy: instance.destroy }
          : null;
      };
    }
    case "glitch": {
      const { createGlitch } = await import("./canvasui/Glitch");
      const options = (s: BackgroundEffect) => ({
        intensity: s.intensity,
        interval: 1.5 / s.speed,
        duration: 0.55 / s.speed,
        shift: 36,
        rgbShift: 6,
      });
      return (elements: GlitchElements, settings: BackgroundEffect): EffectEngine | null => {
        const instance = createGlitch(elements, options(settings));
        return instance
          ? { update: (s) => instance.setOptions(options(s)), destroy: instance.destroy }
          : null;
      };
    }
    case "vhs": {
      const { createVHS } = await import("./canvasui/VHS");
      const options = (s: BackgroundEffect) => ({
        speed: s.speed,
        wave: s.intensity,
        jitter: 0.3 * s.intensity,
        crease: 0.7 * s.intensity,
        switching: s.intensity,
        grain: 0.12 * s.intensity,
        scanlines: 0.3 * s.intensity,
        aberration: 3 * s.intensity,
        barrel: 0.06 * s.intensity,
      });
      return (elements: GlitchElements, settings: BackgroundEffect): EffectEngine | null => {
        const instance = createVHS(elements, options(settings));
        return instance
          ? { update: (s) => instance.setOptions(options(s)), destroy: instance.destroy }
          : null;
      };
    }
    case "droplets": {
      const { createDroplets } = await import("./canvasui/Droplets");
      const options = (s: BackgroundEffect) => ({
        intensity: s.intensity * 0.5,
        speed: s.speed,
        refraction: 0.35 * s.intensity,
        blur: 0.12 * s.intensity,
        scale: 0.55,
        interactive: true,
      });
      return (elements: GlitchElements, settings: BackgroundEffect): EffectEngine | null => {
        const instance = createDroplets(elements, options(settings));
        return instance
          ? { update: (s) => instance.setOptions(options(s)), destroy: instance.destroy }
          : null;
      };
    }
    case "frost": {
      const { createFrost } = await import("./canvasui/Frost");
      const options = (s: BackgroundEffect) => ({
        frost: 0.12 * s.intensity,
        strength: 0.65 * s.intensity,
        opacity: Math.min(1, 0.8 * s.intensity),
        haze: 0.25 * s.intensity,
        refreeze: 2 * s.speed,
        introDuration: 2.5 / s.speed,
        quality: 0.5,
        shimmer: 0.03 * s.speed,
      });
      return (elements: GlitchElements, settings: BackgroundEffect): EffectEngine | null => {
        const instance = createFrost(elements, options(settings));
        return instance
          ? { update: (s) => instance.setOptions(options(s)), destroy: instance.destroy }
          : null;
      };
    }
  }
}
