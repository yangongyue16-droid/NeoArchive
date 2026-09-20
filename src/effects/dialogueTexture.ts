const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Rasterizes the existing dialogue layout without moving or replacing its DOM controls. */
export function createDialogueTexture(stage: HTMLElement) {
  const surface = document.createElement("canvas");
  let dirty = true;
  let disposed = false;
  let revision = 0;
  const invalidate = () => {
    dirty = true;
  };
  const mutations = new MutationObserver(invalidate);
  mutations.observe(stage, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  const resize = new ResizeObserver(invalidate);
  resize.observe(stage);
  document.fonts?.addEventListener("loadingdone", invalidate);
  void document.fonts?.ready.then(() => {
    if (!disposed) invalidate();
  });

  return {
    render(width: number, height: number) {
      if (surface.width !== width || surface.height !== height) {
        surface.width = width;
        surface.height = height;
        dirty = true;
      }
      if (!dirty) return { surface, revision };
      dirty = false;
      revision++;
      const ctx = surface.getContext("2d");
      if (!ctx) throw new Error("无法绘制对白纹理");
      ctx.clearRect(0, 0, width, height);
      const bounds = stage.getBoundingClientRect();
      const layer = stage.querySelector<HTMLElement>(".dialogue-layer");
      if (!layer || !bounds.width || !bounds.height) return { surface, revision };
      const box = layer.getBoundingClientRect();
      ctx.save();
      ctx.scale(width / bounds.width, height / bounds.height);
      const y = box.top - bounds.top;
      const shade = ctx.createLinearGradient(0, y, 0, y + box.height);
      shade.addColorStop(0, "transparent");
      shade.addColorStop(0.18, "rgba(12,27,42,.24)");
      shade.addColorStop(0.52, "rgba(10,24,38,.88)");
      shade.addColorStop(1, "rgba(8,20,33,.96)");
      ctx.fillStyle = shade;
      ctx.fillRect(box.left - bounds.left, y, box.width, box.height);
      const rule = layer.querySelector<HTMLElement>(".dialogue-rule");
      if (rule) {
        const rect = rule.getBoundingClientRect();
        const x = rect.left - bounds.left;
        const gradient = ctx.createLinearGradient(x, 0, x + rect.width, 0);
        gradient.addColorStop(0, "rgba(255,255,255,.68)");
        gradient.addColorStop(0.82, "rgba(255,255,255,.16)");
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, rect.top - bounds.top, rect.width, rect.height);
      }
      for (const element of layer.querySelectorAll<HTMLElement>(
        ".dialogue-content > strong, .dialogue-content > span, .dialogue-content > p",
      )) {
        const style = getComputedStyle(element);
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.fillStyle = style.color;
        ctx.textBaseline = "alphabetic";
        ctx.shadowColor = "rgba(13,28,42,.8)";
        ctx.shadowOffsetY = 1;
        ctx.shadowBlur = 4;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const text = node.textContent ?? "";
          const range = document.createRange();
          let offset = 0;
          for (const { segment: glyph } of graphemes.segment(text)) {
            range.setStart(node, offset);
            offset += glyph.length;
            range.setEnd(node, offset);
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 && glyph.trim()) {
              const metrics = ctx.measureText(glyph);
              const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * 0.85;
              const descent = metrics.fontBoundingBoxDescent ?? parseFloat(style.fontSize) * 0.15;
              const baseline =
                rect.top - bounds.top + (rect.height - ascent - descent) / 2 + ascent;
              ctx.fillText(glyph, rect.left - bounds.left, baseline);
            }
          }
          node = walker.nextNode();
        }
      }
      ctx.restore();
      return { surface, revision };
    },
    destroy() {
      disposed = true;
      mutations.disconnect();
      resize.disconnect();
      document.fonts?.removeEventListener("loadingdone", invalidate);
      surface.width = 1;
      surface.height = 1;
    },
  };
}
