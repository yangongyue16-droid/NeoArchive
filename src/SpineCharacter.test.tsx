// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { SpineCharacter } from "./SpineCharacter";

const mocks = vi.hoisted(() => ({
  width: 1920,
  height: 1080,
  scale: vi.fn(),
  position: vi.fn(),
  resized: vi.fn(),
  observe: null as (() => void) | null,
}));

vi.mock("@esotericsoftware/spine-pixi-v8", () => ({
  Spine: {
    from: () => ({
      skeleton: { data: { animations: [{ name: "Idle" }] } },
      state: { setAnimation: vi.fn() },
      update: vi.fn(),
      scale: { set: mocks.scale },
      position: { set: mocks.position },
      getLocalBounds: () => ({ x: 0, y: 0, width: 200, height: 400 }),
    }),
  },
}));

vi.mock("pixi.js", () => ({
  Assets: { resolver: { hasKey: () => true }, load: () => Promise.resolve() },
  Application: class {
    screen = { width: mocks.width, height: mocks.height };
    // Deliberately different: drawing-buffer pixels must never drive placement.
    renderer = { width: mocks.width * 2, height: mocks.height * 2 };
    canvas = document.createElement("canvas");
    stage = { addChild: vi.fn() };
    init = () => Promise.resolve();
    render = vi.fn();
    destroy = vi.fn();
    resize = () => {
      mocks.resized();
      this.screen.width = mocks.width;
      this.screen.height = mocks.height;
    };
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Spine stage sizing", () => {
  it("fits in logical pixels and resizes before positioning after a container change", async () => {
    mocks.width = 1920;
    mocks.height = 1080;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          mocks.observe = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(
      <SpineCharacter
        enterDurationMs={0}
        positionXPercent={50}
        positionYPercent={80}
        scalePercent={100}
        skeletonUrl="/fixture.skel"
      />,
    );
    await waitFor(() => expect(mocks.position).toHaveBeenCalled());
    const scale = (1080 * 0.94) / 400;
    expect(mocks.scale).toHaveBeenLastCalledWith(scale);
    expect(mocks.position).toHaveBeenLastCalledWith(960 - 100 * scale, 864 - 200 * scale);

    mocks.width = 2560;
    mocks.height = 1080;
    act(() => mocks.observe?.());
    expect(mocks.position).toHaveBeenLastCalledWith(1280 - 100 * scale, 864 - 200 * scale);
    expect(mocks.resized.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.position.mock.invocationCallOrder.at(-1)!,
    );
  });
});
