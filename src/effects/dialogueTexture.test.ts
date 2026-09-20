// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createDialogueTexture } from "./dialogueTexture";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("refreshes typed Unicode dialogue, caches unchanged text, and clears a hidden HUD", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const gradient = { addColorStop: vi.fn() };
  const ctx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: () => gradient,
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4 }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => ctx) as unknown as HTMLCanvasElement["getContext"],
  );
  const stage = document.createElement("article");
  stage.innerHTML =
    '<div class="dialogue-layer"><div class="dialogue-content"><p style="font-size:16px;font-family:sans-serif">雪👩‍💻é</p></div></div>';
  document.body.append(stage);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 400,
    height: 200,
    right: 400,
    bottom: 200,
    toJSON: () => ({}),
  });
  vi.spyOn(document, "createRange").mockReturnValue({
    setStart: vi.fn(),
    setEnd: vi.fn(),
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 16, height: 16 }),
  } as unknown as Range);
  const texture = createDialogueTexture(stage);
  const first = texture.render(800, 400);
  expect(ctx.fillText.mock.calls.map(([text]) => text)).toEqual(["雪", "👩‍💻", "é"]);
  texture.render(800, 400);
  expect(ctx.fillText).toHaveBeenCalledTimes(3);
  stage.querySelector("p")!.textContent = "雪泉";
  await Promise.resolve();
  const second = texture.render(800, 400);
  expect(second.revision).toBeGreaterThan(first.revision);
  expect(ctx.fillText.mock.calls.slice(-2).map(([text]) => text)).toEqual(["雪", "泉"]);
  stage.replaceChildren();
  await Promise.resolve();
  texture.render(800, 400);
  expect(ctx.clearRect).toHaveBeenCalledTimes(3);
  expect(ctx.fillText).toHaveBeenCalledTimes(5);
  texture.destroy();
  expect(first.surface.width).toBe(1);
});
