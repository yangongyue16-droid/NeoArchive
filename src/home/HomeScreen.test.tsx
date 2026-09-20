// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createNewProject, listProjects, upsertProjectMeta } from "../project-schema/projects";
import { useEditorStore } from "../state/editorStore";
import { HomeScreen } from "./HomeScreen";

beforeEach(() => {
  // Node 25 also exposes localStorage; use an isolated browser-like store per test.
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("project library workflows", () => {
  it("rejects whitespace and creates a persisted project with a trimmed title", () => {
    const onOpened = vi.fn();
    render(<HomeScreen onOpened={onOpened} />);
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    const input = screen.getByLabelText("项目名称");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "创建并开始" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.submit(input.closest("form")!);
    expect(listProjects()).toHaveLength(0);
    fireEvent.change(input, { target: { value: "  星光来信  " } });
    fireEvent.submit(input.closest("form")!);
    expect(listProjects()[0].title).toBe("星光来信");
    expect(useEditorStore.getState().project.title).toBe("星光来信");
    expect(onOpened).toHaveBeenCalledOnce();
  });

  it("filters and sorts without changing the saved project order", () => {
    createNewProject("B - 海边");
    createNewProject("A - 天台");
    const originalOrder = listProjects().map((project) => project.projectId);
    render(<HomeScreen onOpened={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "项目排序" }), {
      target: { value: "name" },
    });
    expect(
      screen
        .getAllByRole("button", { name: /^打开项目 / })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["打开项目 A - 天台", "打开项目 B - 海边"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  海边  " } });
    expect(screen.getAllByRole("button", { name: /^打开项目 / })).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "没有这个项目" } });
    expect(screen.getByRole("status").textContent).toContain("没有找到匹配的项目");
    fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
    expect(screen.getAllByRole("button", { name: /^打开项目 / })).toHaveLength(2);
    expect(listProjects().map((project) => project.projectId)).toEqual(originalOrder);
  });

  it("shows a recoverable error when a listed draft is missing", () => {
    upsertProjectMeta({
      projectId: "missing-draft",
      title: "丢失的草稿",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const onOpened = vi.fn();
    render(<HomeScreen onOpened={onOpened} />);
    fireEvent.click(screen.getByRole("button", { name: "打开项目 丢失的草稿" }));
    expect(screen.getByRole("status").textContent).toContain("找不到这个项目的本地草稿");
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("restores focus on Escape without creating a draft", () => {
    render(<HomeScreen onOpened={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "新建项目" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByLabelText("项目名称"), { key: "Escape" });
    expect(screen.queryByLabelText("项目名称")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(listProjects()).toHaveLength(0);
  });

  it("keeps the form available and reports a storage failure", () => {
    const onOpened = vi.fn();
    render(<HomeScreen onOpened={onOpened} />);
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    const input = screen.getByLabelText("项目名称");
    fireEvent.change(input, { target: { value: "星光来信" } });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("本地存储空间已满");
    });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("status").textContent).toContain("本地存储空间已满");
    expect(onOpened).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("星光来信");
  });
});
