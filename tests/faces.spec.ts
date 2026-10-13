import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
const fixture = process.env.HALO_TEST_PORTRAIT || "../../work/portrait.jpg";
test("multiple faces: choose second person and explicit re-place, no external requests", async ({
  page,
}) => {
  test.skip(
    !existsSync(fixture),
    "HALO_TEST_PORTRAITに正面顔のテスト画像を指定してください。",
  );
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith("http://127.0.0.1:5173/")) {
      external.push(url);
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByText("オリジナル・リング", { exact: true }),
  ).toBeVisible();
  const bytes = await page.evaluate(async (data) => {
    const i = new Image();
    i.src = "data:image/jpeg;base64," + data;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 800;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, 1200, 800);
    ctx.drawImage(i, 0, 0, 600, 800);
    ctx.drawImage(i, 600, 0, 600, 800);
    return Array.from(
      new Uint8Array(
        await (
          await new Promise<Blob>((r) => c.toBlob((b) => r(b!)))
        ).arrayBuffer(),
      ),
    );
  }, readFileSync(fixture).toString("base64"));
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "two-people.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
  await expect(page.getByRole("status")).toContainText("two-people");
  await page
    .getByRole("button", { name: "オリジナル・リング Original Ring" })
    .click();
  await expect(page.getByRole("status")).toContainText("2人の顔を検出", {
    timeout: 60000,
  });
  await page.getByLabel("対象の顔").selectOption("1");
  await page.getByRole("button", { name: "初期配置を再実行" }).click();
  const x = Number(
    await page.getByLabel("X座標", { exact: true }).inputValue(),
  );
  await page.getByLabel("対象の顔").selectOption("0");
  await page.getByRole("button", { name: "初期配置を再実行" }).click();
  const x2 = Number(
    await page.getByLabel("X座標", { exact: true }).inputValue(),
  );
  expect(Math.abs(x - x2)).toBeGreaterThan(400);
  expect(external).toEqual([]);
});
test("tilted face places above forehead with roll and auto-rotation switch", async ({
  page,
}) => {
  test.skip(!existsSync(fixture), "HALO_TEST_PORTRAITを指定してください。");
  await page.goto("/");
  await expect(
    page.getByText("オリジナル・リング", { exact: true }),
  ).toBeVisible();
  const bytes = await page.evaluate(async (data) => {
    const i = new Image();
    i.src = "data:image/jpeg;base64," + data;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, 1200, 1200);
    ctx.translate(600, 600);
    ctx.rotate((20 * Math.PI) / 180);
    ctx.drawImage(i, -350, -450, 700, 900);
    return Array.from(
      new Uint8Array(
        await (
          await new Promise<Blob>((r) => c.toBlob((b) => r(b!)))
        ).arrayBuffer(),
      ),
    );
  }, readFileSync(fixture).toString("base64"));
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "tilt.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
  await expect(page.getByRole("status")).toContainText("tilt.png");
  await page
    .getByRole("button", { name: "オリジナル・リング Original Ring" })
    .click();
  await expect(page.getByRole("status")).toContainText("1人の顔を検出", {
    timeout: 60000,
  });
  const angle = Number(
    await page.getByLabel("回転角度", { exact: true }).inputValue(),
  );
  expect(angle).toBeGreaterThan(12);
  expect(angle).toBeLessThan(30);
  expect(
    Number(await page.getByLabel("Y座標", { exact: true }).inputValue()),
  ).toBeLessThan(450);
  await page.getByLabel("顔の傾きを回転へ反映").uncheck();
  await page.getByRole("button", { name: "初期配置を再実行" }).click();
  await expect(page.getByLabel("回転角度", { exact: true })).toHaveValue("0");
});
