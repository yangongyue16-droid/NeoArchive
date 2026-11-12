import process from "node:process";
import { expect, test } from "@playwright/test";
import { audioProject } from "./audioFixture";

test.use({
  // Trace DOM snapshots also evaluate page scripts and can unlock autoplay.
  trace: "off",
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ["--autoplay-policy=document-user-activation-required"],
  },
});

test("a visible user gesture can enable music and voice after autoplay is denied", async ({
  page,
}) => {
  await page.addInitScript((project) => {
    localStorage.setItem("neoarchive:active-project:v1", project.projectId);
    localStorage.setItem(
      `neoarchive:project-draft:v1:${project.projectId}`,
      JSON.stringify(project),
    );
  }, audioProject());
  await page.goto("/#/player");
  const music = page.locator("audio[loop]");
  // Locator helpers can activate Chromium's document. Inspect the blocked
  // state without a synthetic gesture until the explicit enable-button click.
  const cdp = await page.context().newCDPSession(page);
  await expect
    .poll(async () => {
      const state = await cdp.send("Runtime.evaluate", {
        expression:
          "({paused: document.querySelector('audio[loop]')?.paused, retry: [...document.querySelectorAll('.audio-retry')].some(b => b.textContent === '点击启用背景音乐'), activated: navigator.userActivation.hasBeenActive})",
        returnByValue: true,
        userGesture: false,
      });
      return state.result.value;
    })
    .toEqual({ paused: true, retry: true, activated: false });
  await cdp.detach();
  await page.getByRole("button", { name: "点击启用背景音乐", exact: true }).click();
  await expect.poll(() => music.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  expect(await music.evaluate((a: HTMLAudioElement) => a.volume)).toBe(0.2);
  await page.getByRole("button", { name: "点击启用语音", exact: true }).click();
  await expect
    .poll(() => page.locator("audio:not([loop])").evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.5);
  await expect(page.locator(".audio-retry")).toHaveCount(0);
});
