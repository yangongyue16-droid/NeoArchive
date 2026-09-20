// @vitest-environment jsdom
import { StrictMode, useRef } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { BackgroundEffectLayer } from "./BackgroundEffectLayer";
import { loadEffectEngine, type EffectEngine } from "./engine";
import type { BackgroundEffect } from "./settings";

vi.mock("./engine", () => ({ loadEffectEngine: vi.fn() }));
const setting: BackgroundEffect = { kind: "frost", intensity: 1, speed: 1 };
let motion = false;
let motionListeners = new Set<() => void>();
const loseContext = vi.fn();
const getContext = vi.fn(() => ({ getExtension: () => ({ loseContext }) }));

function Harness({ settings = setting }: { settings?: BackgroundEffect }) {
  const stageRef = useRef<HTMLElement>(null);
  return (
    <article ref={stageRef}>
      <img alt="" className="stage-background" src="/test.png" />
      <BackgroundEffectLayer settings={settings} stageRef={stageRef} sourceKey={1} fit="cover" />
    </article>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  motion = false;
  motionListeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    matches: motion,
    addEventListener: (_: string, cb: () => void) => motionListeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => motionListeners.delete(cb),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    getContext as unknown as HTMLCanvasElement["getContext"],
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mockEngine() {
  const engine = { update: vi.fn(), destroy: vi.fn() };
  const create = vi.fn(() => engine);
  vi.mocked(loadEffectEngine).mockResolvedValue(create);
  return { engine, create };
}

describe("background effect lifecycle", () => {
  it("does not allocate or lose a context for a cancelled StrictMode setup", async () => {
    const { create, engine } = mockEngine();
    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(getContext).not.toHaveBeenCalled();
    view.unmount();
    expect(engine.destroy).toHaveBeenCalledOnce();
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it("updates parameters without recreating the engine and releases it at zero intensity", async () => {
    const { create, engine } = mockEngine();
    const view = render(<Harness />);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    view.rerender(<Harness settings={{ ...setting, speed: 2 }} />);
    expect(engine.update).toHaveBeenLastCalledWith({ ...setting, speed: 2 });
    expect(create).toHaveBeenCalledOnce();
    view.rerender(<Harness settings={{ ...setting, intensity: 0 }} />);
    expect(engine.destroy).toHaveBeenCalledOnce();
    expect(view.container.querySelector("canvas")).toBeNull();
  });

  it("recreates the texture and renderer when dialogue coverage changes", async () => {
    const { create, engine } = mockEngine();
    const view = render(<Harness />);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const previousCanvas = view.container.querySelector("canvas");
    view.rerender(<Harness settings={{ ...setting, coverDialogue: true }} />);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(engine.destroy).toHaveBeenCalledOnce();
    expect(view.container.querySelector("canvas")).not.toBe(previousCanvas);
    expect(view.container.querySelector("canvas")?.classList.contains("covers-dialogue")).toBe(
      true,
    );
    view.rerender(<Harness settings={setting} />);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    expect(view.container.querySelector("canvas")?.classList.contains("covers-dialogue")).toBe(
      false,
    );
  });

  it("does not create a GPU engine after unmount while a module is loading", async () => {
    const create = vi.fn(() => null);
    let resolve!: (factory: () => EffectEngine | null) => void;
    vi.mocked(loadEffectEngine).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<Harness />);
    view.unmount();
    await act(async () => {
      resolve(create);
    });
    expect(create).not.toHaveBeenCalled();
    expect(getContext).not.toHaveBeenCalled();
  });

  it("preserves the source and reports a failed renderer", async () => {
    vi.mocked(loadEffectEngine).mockResolvedValue(() => null);
    const view = render(<Harness />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("已保留原画面"));
    expect(view.container.querySelector("img")).not.toBeNull();
    expect(view.container.querySelector("canvas")?.style.visibility).toBe("hidden");
  });

  it("releases the engine when reduced motion is enabled", async () => {
    const { create, engine } = mockEngine();
    const view = render(<Harness />);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    act(() => {
      motion = true;
      for (const listener of motionListeners) listener();
    });
    expect(engine.destroy).toHaveBeenCalledOnce();
    expect(view.container.querySelector("canvas")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("减少动态效果");
  });
});
