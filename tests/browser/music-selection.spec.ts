import { expect, test } from "@playwright/test";
import { audioProject } from "./audioFixture";

test("music selection is visible on the audio cue, previews, saves, and loops in the player", async ({
  page,
}) => {
  const project = audioProject();
  await page.addInitScript((project) => {
    // Seed once so reload exercises the edited draft rather than replacing it.
    if (!localStorage.getItem("neoarchive:project-draft:v1:" + project.projectId)) {
      localStorage.setItem("neoarchive:active-project:v1", project.projectId);
      localStorage.setItem(
        "neoarchive:project-draft:v1:" + project.projectId,
        JSON.stringify(project),
      );
      localStorage.setItem("neoarchive:project-index:v1", JSON.stringify([project]));
    }
  }, project);
  await page.goto("/");
  await page.locator(".home-proj-tile").click();
  await page.locator('.script-cue-row[data-cue-id="music"] .cue-main').click();
  const panel = page.getByRole("region", { name: "音乐选区", exact: true });
  await expect(panel).toBeVisible();
  const start = panel.getByRole("spinbutton", { name: "音乐起点（ms）" });
  const end = panel.getByRole("spinbutton", { name: "音乐终点（ms）" });
  await expect(start).toBeEnabled();
  await start.fill("1000");
  await end.fill("1800");
  await panel.getByRole("button", { name: "试听", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("试听中");
  await expect(panel.getByRole("status")).toContainText("就绪", { timeout: 2000 });
  // Drag the end handle and confirm it is the same persisted selection.
  const handle = panel.locator(".voice-waveform-endpoint");
  const bounds = await handle.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 12, bounds!.y + bounds!.height / 2);
  await page.mouse.up();
  expect(Number(await end.inputValue())).toBeGreaterThan(1800);
  await end.fill("1800");
  const panelSize = await panel.evaluate((element) => ({
    width: element.clientWidth,
    contentWidth: element.scrollWidth,
  }));
  expect(panelSize.contentWidth).toBeLessThanOrEqual(panelSize.width + 1);
  await page.screenshot({ path: "artifacts/music-selection-editor.png" });
  await page.getByRole("button", { name: "主页", exact: true }).click();
  await page.reload();
  await page.locator(".home-proj-tile").click();
  await page.locator('.script-cue-row[data-cue-id="music"] .cue-main').click();
  await expect(start).toHaveValue("1000");
  await expect(end).toHaveValue("1800");
  await page.goto("/#/player");
  const music = page.locator('audio[data-channel="bgm"]');
  await expect
    .poll(() => music.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThanOrEqual(1);
  expect(await music.evaluate((a: HTMLAudioElement) => a.loop)).toBe(false);
  await music.evaluate((a) => {
    a.setAttribute("data-loop-count", "0");
    a.addEventListener("seeking", () =>
      a.setAttribute("data-loop-count", String(Number(a.getAttribute("data-loop-count")) + 1)),
    );
  });
  await expect.poll(() => music.getAttribute("data-loop-count"), { timeout: 4000 }).not.toBe("0");
  await expect
    .poll(async () => Number(await music.getAttribute("data-loop-count")), { timeout: 4000 })
    .toBeGreaterThanOrEqual(2);
  const time = await music.evaluate((a: HTMLAudioElement) => a.currentTime);
  expect(time).toBeGreaterThanOrEqual(1);
  expect(time).toBeLessThan(1.9);
  expect(await music.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
});

test("non-looping music stops at the selected end", async ({ page }) => {
  const project = audioProject();
  const cue = project.chapters[0].scenes[0].cues[0];
  Object.assign(cue, { loop: false, startMs: 500, endMs: 1100 });
  await page.addInitScript((project) => {
    localStorage.setItem("neoarchive:active-project:v1", project.projectId);
    localStorage.setItem(
      "neoarchive:project-draft:v1:" + project.projectId,
      JSON.stringify(project),
    );
  }, project);
  await page.goto("/#/player");
  const music = page.locator('audio[data-channel="bgm"]');
  await expect
    .poll(() => music.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThanOrEqual(1.1);
  await expect.poll(() => music.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  expect(await music.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeLessThan(1.3);
});
