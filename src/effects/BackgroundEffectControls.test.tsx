// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { BackgroundEffectControls } from "./BackgroundEffectControls";

afterEach(cleanup);
it("defaults to clear dialogue and preserves coverage when changing effects", () => {
  const onChange = vi.fn();
  const effect = { kind: "frost" as const, intensity: 1.4, speed: 0.5 };
  const view = render(<BackgroundEffectControls effect={effect} onChange={onChange} />);
  expect((screen.getByRole("checkbox", { name: "覆盖对白文字" }) as HTMLInputElement).checked).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "覆盖对白文字" }));
  expect(onChange).toHaveBeenLastCalledWith({ ...effect, coverDialogue: true });
  view.rerender(
    <BackgroundEffectControls effect={{ ...effect, coverDialogue: true }} onChange={onChange} />,
  );
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "glitch" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...effect, kind: "glitch", coverDialogue: true });
});
