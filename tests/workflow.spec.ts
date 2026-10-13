import { test, expect } from "@playwright/test";
test("continuous editing: second halo, brush undo/redo, ZIP UI restore and duplication", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("オリジナル・リング", { exact: true }),
  ).toBeVisible();
  const bytes = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 1000;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#253448";
    ctx.fillRect(0, 0, 800, 1000);
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
      name: "blank.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
  await expect(page.getByRole("status")).toContainText("blank.png");
  await page
    .getByRole("button", { name: "オリジナル・リング Original Ring" })
    .click();
  await expect(page.getByRole("status")).toContainText("顔が見つかりません");
  await page
    .getByRole("button", { name: "オリジナル・クロス Original Cross" })
    .click();
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("200");
  await expect(
    page.locator(".layer").filter({ hasText: "オリジナル・リング" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".layer").filter({ hasText: "オリジナル・クロス" }),
  ).toHaveCount(1);
  await page.getByLabel("X座標", { exact: true }).fill("300");
  await page.getByLabel("Y座標", { exact: true }).fill("350");
  await page.getByLabel("表示倍率").selectOption("1");
  await page.getByRole("button", { name: "非表示ブラシ", exact: true }).click();
  const box = await page.locator("canvas.upper-canvas").boundingBox();
  await page.mouse.move(box!.x + 280, box!.y + 350);
  await page.mouse.down();
  await page.mouse.move(box!.x + 320, box!.y + 350, { steps: 6 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "マスクをリセット" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "↶", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "マスクをリセット" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "↷", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "マスクをリセット" }),
  ).toBeEnabled();
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "プロジェクト保存", exact: true })
    .click();
  const downloaded = await waiting;
  const stream = await downloaded.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page
    .locator("input[type=file]")
    .nth(2)
    .setInputFiles({
      name: "saved.zip",
      mimeType: "application/zip",
      buffer: Buffer.concat(chunks),
    });
  await expect(page.getByRole("status")).toContainText("プロジェクトを復元");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("300");
  await expect(
    page.getByRole("button", { name: "マスクをリセット" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "複製", exact: true }).click();
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("320");
  await page.getByLabel("表示倍率").selectOption("0.5");
  await page
    .getByRole("button", { name: "頭の中心をクリックして配置", exact: true })
    .click();
  const canvas = await page.locator("canvas.upper-canvas").boundingBox();
  await page.mouse.click(canvas!.x + 160, canvas!.y + 200);
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("320");
  await expect(page.getByLabel("Y座標", { exact: true })).toHaveValue("362");
  await page.keyboard.down("Alt");
  await page.mouse.move(canvas!.x + 160, canvas!.y + 181);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + 200, canvas!.y + 201, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("320");
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("200");
  await page.getByRole("button", { name: "全体表示", exact: true }).click();
});
