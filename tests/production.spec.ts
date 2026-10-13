import { basename } from "node:path";
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
test("built app starts offline, real worker detects, PNG exports", async ({
  page,
}) => {
  const url = process.env.HALO_PRODUCTION_URL,
    fixture = process.env.HALO_TEST_PORTRAIT || "../../work/portrait.jpg";
  test.skip(
    !url || !existsSync(fixture),
    "本番版URLと実顔画像を指定してください。",
  );
  const origin = new URL(url!).origin;
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const r = route.request().url();
    if (/^https?:/.test(r) && new URL(r).origin !== origin) {
      external.push(r);
      await route.abort();
    } else await route.continue();
  });
  await page.goto(url!);
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
  await page.getByLabel("出力形式").selectOption("halo");
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  const d = await waiting;
  expect(d.suggestedFilename()).toBe(
    basename(fixture).replace(/\.[^.]+$/, "") + "_addhalo.png",
  );
  expect(external).toEqual([]);
});
