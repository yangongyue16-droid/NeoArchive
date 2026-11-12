import { expect, test } from "@playwright/test";
import { audioProject } from "./audioFixture";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((project) => {
    localStorage.setItem("neoarchive:active-project:v1", project.projectId);
    localStorage.setItem(
      `neoarchive:project-draft:v1:${project.projectId}`,
      JSON.stringify(project),
    );
  }, audioProject());
});

test("BGM volume, voice trim, blank-page continuity, volume change and stop all reach the media elements", async ({
  page,
}) => {
  await page.goto("/#/player");
  const music = page.locator("audio[loop]");
  const voice = page.locator("audio:not([loop])");
  await expect.poll(() => music.evaluate((a: HTMLAudioElement) => a.volume)).toBe(0.2);
  await expect
    .poll(() => music.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1);
  await expect.poll(() => voice.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  expect(await voice.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThanOrEqual(1.5);
  expect(await voice.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeLessThan(1.7);

  await music.evaluate((a) => {
    a.setAttribute("data-continuity-check", "original");
  });
  const before = await music.evaluate((a: HTMLAudioElement) => a.currentTime);
  await page.getByRole("button", { name: "下一句", exact: true }).click();
  await expect(page.getByLabel("空白页", { exact: true })).toBeVisible();
  await expect(voice).toHaveCount(0);
  expect(await music.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  await expect(page.locator(".dialogue-content p")).toHaveText("空白页结束");
  await expect(music).toHaveAttribute("data-continuity-check", "original");
  expect(await music.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(
    before + 1.4,
  );

  await page.getByRole("button", { name: "下一句", exact: true }).click();
  await expect.poll(() => music.evaluate((a: HTMLAudioElement) => a.volume)).toBe(0.6);
  await expect(music).toHaveAttribute("data-continuity-check", "original");
  expect(await music.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  const oldTrack = await music.elementHandle();
  await page.getByRole("button", { name: "下一句", exact: true }).click();
  await expect(music).toHaveCount(0);
  expect(await oldTrack!.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  const effect = page.locator("audio");
  await expect.poll(() => effect.evaluate((a: HTMLAudioElement) => a.volume)).toBe(0.15);
  await expect
    .poll(() => effect.evaluate((a: HTMLAudioElement) => a.ended), { timeout: 5000 })
    .toBe(true);
  expect(await effect.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await page.screenshot({ path: "artifacts/music-playback-verified.png" });
});

test("looping BGM wraps naturally and survives a dialogue UI toggle", async ({ page }) => {
  await page.goto("/#/player");
  const music = page.locator("audio[loop]");
  await expect
    .poll(() => music.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1);
  // Seek near the natural end to exercise the actual browser loop in a short test.
  await music.evaluate((a: HTMLAudioElement) => {
    a.currentTime = a.duration - 0.3;
  });
  await expect.poll(() => music.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeLessThan(1);
  expect(await music.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  expect(await music.evaluate((a: HTMLAudioElement) => a.ended)).toBe(false);
  await page.getByRole("button", { name: "隐藏对话框", exact: true }).click();
  expect(await music.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  await page.getByRole("button", { name: "显示对话框", exact: true }).click();
  expect(await music.evaluate((a: HTMLAudioElement) => a.volume)).toBe(0.2);
});
