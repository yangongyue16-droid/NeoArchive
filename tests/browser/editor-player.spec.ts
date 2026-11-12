import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";

function audioFixture(): string {
  const samples = 3 * 8000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    wav.writeInt16LE(Math.round(Math.sin((index / 8000) * Math.PI * 880) * 1000), 44 + index * 2);
  }
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}

function projectFixture(aspect = "21:9", voice = false) {
  return {
    schemaVersion: 1,
    projectId: "browser-fixture",
    title: "布局与播放验证",
    entrySceneId: "scene",
    createdAt: "2026-11-13T00:00:00Z",
    updatedAt: "2026-11-13T00:00:00Z",
    openingFadeMs: 0,
    dialogueTypingCps: 100,
    dialogueHoldMs: 600000,
    voiceHoldMs: 600000,
    stage: {
      aspect,
      width: aspect === "21:9" ? 2560 : 1920,
      height: 1080,
      backgroundFit: "contain",
    },
    chapters: [
      {
        id: "chapter",
        title: "测试",
        scenes: [
          {
            id: "scene",
            title: "测试场景",
            kind: "dialogue",
            cues: [
              {
                id: "background",
                type: "background.set",
                atMs: 0,
                transitionMs: 0,
                assetRef:
                  "data:image/svg+xml," +
                  encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#264c66"/><circle cx="960" cy="540" r="200" fill="#8ed3e6"/></svg>',
                  ),
              },
              {
                id: "dialogue",
                type: "dialogue.show",
                atMs: 0,
                speaker: "测试角色",
                subtitle: "布局验证",
                text: "在超宽屏与全屏切换后，画面、对白和舞台保持对齐。",
                waitForAdvance: true,
                ...(voice
                  ? { voiceAssetRef: audioFixture(), voiceStartMs: 250, voiceEndMs: 1250 }
                  : {}),
              },
              {
                id: "blank",
                type: "wait",
                atMs: 0,
                blank: true,
                durationMs: 900,
                waitForAdvance: false,
              },
              {
                id: "after",
                type: "dialogue.show",
                atMs: 0,
                speaker: "测试角色",
                text: "空白页结束。",
                waitForAdvance: true,
              },
            ],
          },
        ],
      },
    ],
  };
}

async function seed(page: Page, aspect = "21:9", voice = false) {
  const project = projectFixture(aspect, voice);
  await page.addInitScript((data) => {
    localStorage.setItem("neoarchive:active-project:v1", data.projectId);
    localStorage.setItem(`neoarchive:project-draft:v1:${data.projectId}`, JSON.stringify(data));
    localStorage.setItem("neoarchive:project-index:v1", JSON.stringify([data]));
  }, project);
}

async function geometry(page: Page) {
  return page.locator(".story-stage").evaluate((element) => {
    const stage = element.getBoundingClientRect();
    const host = element.parentElement!.getBoundingClientRect();
    const style = getComputedStyle(element.parentElement!);
    return {
      x: stage.x,
      y: stage.y,
      width: stage.width,
      height: stage.height,
      centerX: stage.x + stage.width / 2,
      centerY: stage.y + stage.height / 2,
      hostX: host.x + host.width / 2,
      hostY: host.y + host.height / 2,
      availableWidth: host.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      availableHeight: host.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    };
  });
}

async function expectFit(page: Page, ratio: number) {
  await expect
    .poll(async () => {
      const g = await geometry(page);
      return Math.abs(g.width / g.height - ratio);
    })
    .toBeLessThan(0.005);
  const g = await geometry(page);
  expect(Math.abs(g.centerX - g.hostX)).toBeLessThan(1);
  expect(Math.abs(g.centerY - g.hostY)).toBeLessThan(1);
  expect(g.width).toBeLessThanOrEqual(g.availableWidth + 1);
  expect(g.height).toBeLessThanOrEqual(g.availableHeight + 1);
}

test("ultrawide editor fits both work modes, resizing and preserves background fit", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 2560, height: 1080 });
  await page.goto("/");
  await page.locator(".home-proj-tile").click();
  await expect(page.locator(".workspace")).toBeVisible();
  await expectFit(page, 2560 / 1080);
  await expect(page.locator(".stage-background")).toHaveCSS("object-fit", "contain");
  await page.getByRole("button", { name: "幕后", exact: true }).click();
  await expectFit(page, 2560 / 1080);
  await page.screenshot({ path: "artifacts/editor-ultrawide.png" });
  for (const [width, height] of [
    [3440, 1440],
    [1440, 900],
    [1120, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await expectFit(page, 2560 / 1080);
    expect(await page.locator(".workspace").evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
  }
});

for (const aspect of ["16:9", "21:9"]) {
  test(`${aspect} player keeps centered stage through chrome and fullscreen changes`, async ({
    page,
  }) => {
    await seed(page, aspect);
    await page.setViewportSize({ width: 2560, height: 1080 });
    await page.goto("/#/player");
    await expect(page.locator(".dialogue-content p")).toHaveText(/超宽屏/);
    // Browsers can deny the automatic request; recover through the visible button.
    await page.keyboard.press("h");
    if (!(await page.locator(".player-controls").isVisible())) await page.keyboard.press("h");
    await expectFit(page, aspect === "21:9" ? 2560 / 1080 : 16 / 9);
    if (!(await page.evaluate(() => Boolean(document.fullscreenElement)))) {
      await page.getByRole("button", { name: "全屏", exact: true }).click();
    }
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.getByRole("button", { name: "隐藏 UI", exact: true }).click();
    await expect(page.locator(".player-shell")).toHaveClass(/is-chrome-hidden/);
    await page.waitForTimeout(300);
    await expect(page.locator(".player-shell")).toHaveClass(/is-chrome-hidden/);
    await expect(page.locator(".player-notice")).toHaveCount(0);
    await expectFit(page, aspect === "21:9" ? 2560 / 1080 : 16 / 9);
    await page.screenshot({ path: `artifacts/player-${aspect.replace(":", "-")}-fullscreen.png` });
    await page.evaluate(() => document.exitFullscreen());
    await page.keyboard.press("h");
    await expect(page.getByRole("button", { name: "全屏", exact: true })).toBeVisible();
    for (const [width, height] of [
      [3440, 1440],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await expectFit(page, aspect === "21:9" ? 2560 / 1080 : 16 / 9);
    }
  });
}

test("blank duration can be edited, saved, reopened and takes effect in playback", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await page.locator(".home-proj-tile").click();
  await page.locator('.script-cue-row[data-cue-id="blank"]').click();
  await page.getByLabel("空白页持续时间（ms）").fill("1600");
  await page.getByRole("button", { name: "主页", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("neoarchive:project-draft:v1:browser-fixture")!),
  );
  expect(saved.chapters[0].scenes[0].cues[2]).toMatchObject({ blank: true, durationMs: 1600 });
  // Prevent the initialization fixture from overwriting the edited draft on reload.
  await page.addInitScript(
    (data) =>
      localStorage.setItem("neoarchive:project-draft:v1:browser-fixture", JSON.stringify(data)),
    saved,
  );
  await page.goto("/#/player");
  await expect(page.locator(".dialogue-content p")).toHaveText(
    "在超宽屏与全屏切换后，画面、对白和舞台保持对齐。",
  );
  await page.locator(".story-stage").click();
  await expect(page.getByLabel("空白页", { exact: true })).toBeVisible();
  await expect(page.locator(".dialogue-layer")).toHaveCount(0);
  const started = Date.now();
  await page.locator(".story-stage").click();
  await page.waitForTimeout(1100);
  await expect(page.getByLabel("空白页", { exact: true })).toBeVisible();
  await expect(page.locator(".dialogue-content p")).toHaveText("空白页结束。", { timeout: 2500 });
  expect(Date.now() - started).toBeGreaterThan(1400);
});

test("voice points accept exact milliseconds and preview stops at the selected end", async ({
  page,
}) => {
  await seed(page, "21:9", true);
  await page.goto("/");
  await page.locator(".home-proj-tile").click();
  await page.getByRole("button", { name: "已绑定语音，点击展开或收起" }).click();
  const start = page.getByRole("spinbutton", { name: "语音起点（ms）" });
  const end = page.getByRole("spinbutton", { name: "语音终点（ms）" });
  await expect(start).toBeEnabled();
  await start.fill("500");
  await end.fill("1500");
  await expect(start).toHaveValue("500");
  await expect(end).toHaveValue("1500");
  await page.getByRole("button", { name: "试听终点前 0.8 秒", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("试听中");
  await expect(page.getByRole("status")).toContainText("就绪", { timeout: 1800 });
  await end.fill("300");
  await expect(start).toHaveValue("299");
  await page.screenshot({ path: "artifacts/voice-selection.png" });
});

test("player truncates the selected voice and keeps fullscreen state honest on rejection", async ({
  page,
}) => {
  await seed(page, "21:9", true);
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("denied for test"));
  });
  await page.goto("/#/player");
  await expect(page.getByRole("button", { name: "全屏", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "全屏", exact: true }).click();
  await expect(page.locator(".player-notice")).toContainText("未能进入全屏");
  await expect(page.getByRole("button", { name: "退出全屏", exact: true })).toHaveCount(0);
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThanOrEqual(1.25);
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true);
  const time = await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime);
  expect(time).toBeGreaterThanOrEqual(1.25);
  expect(time).toBeLessThan(1.4);
});
