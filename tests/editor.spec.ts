import { basename } from "node:path";
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
test("Phase 1: photo, fixed aspect transform, undo, original-size export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("オリジナル・リング", { exact: true }),
  ).toBeVisible();
  const bytes = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 4000;
    c.height = 6000;
    const x = c.getContext("2d")!;
    x.fillStyle = "#28374b";
    x.fillRect(0, 0, 4000, 6000);
    return Array.from(
      new Uint8Array(
        await (
          await new Promise<Blob>((r) => c.toBlob((b) => r(b!)))
        ).arrayBuffer(),
      ),
    );
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
  await expect(page.getByRole("status")).toContainText("4000 × 6000");
  await page
    .getByRole("button", { name: "オリジナル・リング Original Ring" })
    .click();
  await expect(page.getByRole("status")).toContainText("顔が見つかりません");
  await page.getByLabel("X座標", { exact: true }).fill("1234");
  await page.getByLabel("Y座標", { exact: true }).fill("1800");
  const ratio =
    Number(await page.getByLabel("高さ", { exact: true }).inputValue()) /
    Number(await page.getByLabel("幅", { exact: true }).inputValue());
  await page.getByLabel("幅", { exact: true }).fill("1600");
  expect(
    Number(await page.getByLabel("高さ", { exact: true }).inputValue()) / 1600,
  ).toBeCloseTo(ratio, 3);
  await page.getByLabel("高さ", { exact: true }).fill("700");
  expect(
    700 / Number(await page.getByLabel("幅", { exact: true }).inputValue()),
  ).toBeCloseTo(ratio, 3);
  await page.getByLabel("水平スキュー").fill("12");
  await page.getByLabel("垂直スキュー").fill("-6");
  await page.getByLabel("表示倍率").selectOption("0.25");
  await page.getByLabel("表示倍率").selectOption("2");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("1234");
  await page.locator("body").click({ position: { x: 710, y: 80 } });
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("1235");
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("1234");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  const d = await download;
  const stream = await d.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const png = Buffer.concat(chunks);
  expect(png.readUInt32BE(16)).toBe(4000);
  expect(png.readUInt32BE(20)).toBe(6000);
  expect(errors).toEqual([]);
});
test("Phase 3: three glow layers, mask applies to glow and restore", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { importAsset } = await import("/src/images.ts");
    const { tile } = await import("/src/render.ts");
    const { defaultGlow } = await import("/src/model.ts");
    const a = await importAsset(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="35" fill="none" stroke="white" stroke-width="8"/></svg>',
        ],
        "test.svg",
      ),
    );
    const l = {
      id: "l",
      assetId: a.id,
      name: "test",
      x: 100,
      y: 100,
      width: 300,
      height: 300,
      angle: 15,
      skewX: 4,
      skewY: -2,
      opacity: 1,
      visible: true,
      manual: true,
      glow: structuredClone(defaultGlow),
      mask: [],
    };
    const alpha = (c: HTMLCanvasElement) => {
      const data = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) n += data[i];
      return n;
    };
    const on = await tile(a, l, 1000);
    const off = await tile(
      a,
      { ...l, glow: { ...l.glow, enabled: false } },
      1000,
    );
    const stroke = {
      mode: "hide",
      size: 0.55,
      hardness: 1,
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
    };
    const masked = await tile(a, { ...l, mask: [stroke] }, 1000);
    const restored = await tile(
      a,
      { ...l, mask: [stroke, { ...stroke, mode: "restore" }] },
      1000,
    );
    return {
      on: alpha(on.canvas),
      off: alpha(off.canvas),
      masked: alpha(masked.canvas),
      restored: alpha(restored.canvas),
    };
  });
  expect(result.on).toBeGreaterThan(result.off);
  expect(result.masked).toBeLessThan(result.on * 0.8);
  expect(result.restored / result.on).toBeGreaterThan(0.999);
});
test("Phase 2: real worker face placement, re-detection preserves edits", async ({
  page,
}) => {
  const fixture = process.env.HALO_TEST_PORTRAIT || "../../work/portrait.jpg";
  test.skip(
    !existsSync(fixture),
    "HALO_TEST_PORTRAITに正面顔の画像を指定してください。",
  );
  await page.goto("/");
  await expect(
    page.getByText("オリジナル・リング", { exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").first().setInputFiles(fixture);
  await expect(page.getByRole("status")).toContainText(basename(fixture));
  await page
    .getByRole("button", { name: "オリジナル・リング Original Ring" })
    .click();
  await expect(page.getByRole("status")).toContainText("1人の顔を検出", {
    timeout: 60000,
  });
  const x = Number(
      await page.getByLabel("X座標", { exact: true }).inputValue(),
    ),
    y = Number(await page.getByLabel("Y座標", { exact: true }).inputValue());
  expect(x).toBeGreaterThan(100);
  expect(y).toBeGreaterThan(0);
  expect(y).toBeLessThan(300);
  await page.getByLabel("X座標", { exact: true }).fill("777");
  await page.getByRole("button", { name: "顔を再検出", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1人の顔を検出");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("777");
  await page.getByRole("button", { name: "初期配置を再実行" }).click();
  await expect(page.getByLabel("X座標", { exact: true })).not.toHaveValue(
    "777",
  );
});
