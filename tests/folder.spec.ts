import { test, expect, type Page } from "@playwright/test";

async function fixture(page: Page, url = "/") {
  await page.goto(url);
  await expect(
    page.getByText("オリジナル・リング", { exact: true }),
  ).toBeVisible();
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(
      "撮影写真（動作確認）-" + crypto.randomUUID().slice(0, 8),
      { create: true },
    );
    const wrong = await root.getDirectoryHandle(
      "halo-test-" + crypto.randomUUID(),
      { create: true },
    );
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 1000;
    c.getContext("2d")!.fillStyle = "#203447";
    c.getContext("2d")!.fillRect(0, 0, 800, 1000);
    const png = await new Promise<Blob>((r) => c.toBlob((b) => r(b!)));
    async function put(
      d: FileSystemDirectoryHandle,
      name: string,
      data: Blob | string,
    ) {
      const s = await (
        await d.getFileHandle(name, { create: true })
      ).createWritable();
      await s.write(data);
      await s.close();
    }
    await put(directory, "photo2.png", png);
    await put(
      directory,
      "photo10.jpg",
      await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg")),
    );
    await put(
      directory,
      "photo1.webp",
      await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/webp")),
    );
    await put(directory, "photo1_addhalo.png", "KEEP EXISTING OUTPUT");
    await put(directory, "notes.txt", "not a photo");
    const sub = await directory.getDirectoryHandle("subfolder", {
      create: true,
    });
    await put(sub, "ignored.png", png);
    c.getContext("2d")!.fillStyle = "#bb2233";
    c.getContext("2d")!.fillRect(0, 0, 800, 1000);
    await put(
      wrong,
      "photo2.png",
      await new Promise<Blob>((r) => c.toBlob((b) => r(b!))),
    );
    const state = {
      directory,
      wrong,
      picks: 0,
      activation: [] as boolean[],
      options: [] as unknown[],
      useWrong: false,
      cancel: false,
      denied: false,
    };
    (window as any).__folderTest = state;
    Object.defineProperty(directory, "queryPermission", {
      configurable: true,
      value: async () => (state.denied ? "denied" : "granted"),
    });
    Object.defineProperty(directory, "requestPermission", {
      configurable: true,
      value: async () => (state.denied ? "denied" : "granted"),
    });
    (window as any).showDirectoryPicker = async (options: unknown) => {
      state.picks++;
      state.activation.push(navigator.userActivation.isActive);
      state.options.push(options);
      if (state.cancel) throw new DOMException("cancelled", "AbortError");
      return state.useWrong ? wrong : directory;
    };
    const originals: Record<string, number[]> = {};
    for (const name of ["photo1.webp", "photo2.png", "photo10.jpg"])
      originals[name] = Array.from(
        new Uint8Array(
          await (
            await (await directory.getFileHandle(name)).getFile()
          ).arrayBuffer(),
        ),
      );
    return { originals };
  });
}

test.afterEach(async ({ page }) => {
  await page
    .evaluate(async () => {
      const s = (window as any).__folderTest;
      if (s) {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(s.directory.name, { recursive: true });
        await root.removeEntry(s.wrong.name, { recursive: true });
      }
    })
    .catch(() => {});
});

test("folder sequence inherits glow and transforms, restores independent edits and saves beside source", async ({
  page,
}) => {
  const { originals } = await fixture(page);
  await page
    .getByRole("button", { name: "フォルダーを開く", exact: true })
    .click();
  const queue = page.getByLabel("フォルダー内の写真");
  await expect(queue).toHaveValue("0");
  await expect(queue.locator("option")).toHaveCount(3);
  await expect(page.getByRole("status")).toContainText("photo1.webp");
  await page
    .getByRole("button", { name: "オリジナル・リング Original Ring" })
    .click();
  await expect(page.getByRole("status")).toContainText("顔が見つかりません");
  const settings = {
    X座標: "321",
    Y座標: "333",
    幅: "280",
    回転角度: "12",
    "前後回転（X軸）": "30",
    "左右回転（Y軸）": "-10",
    不透明度: "0.7",
    水平スキュー: "8",
    垂直スキュー: "-3",
    発光カラー: "#ffa455",
    発光強度: "1.7",
    発光半径倍率: "1.4",
    "core opacity": "0.85",
    "inner brightness": "2.1",
    "outer blur": "46",
  };
  for (const [label, value] of Object.entries(settings))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("合成モード").selectOption("lighter");
  const height = await page.getByLabel("高さ", { exact: true }).inputValue();
  await page.getByLabel("表示倍率").selectOption("0.5");
  await page.getByRole("button", { name: "非表示ブラシ", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute("aria-busy", "false");
  const box = (await page.locator("canvas.upper-canvas").boundingBox())!;
  await page.mouse.move(box.x + 155, box.y + 166);
  await page.mouse.down();
  await page.mouse.move(box.x + 175, box.y + 166, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "マスクをリセット" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "次の写真", exact: true }).click();
  await expect(queue).toHaveValue("1");
  for (const [label, value] of Object.entries(settings))
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  await expect(page.getByLabel("高さ", { exact: true })).toHaveValue(height);
  await expect(page.getByLabel("合成モード")).toHaveValue("lighter");
  await expect(page.getByLabel("発光を有効")).toBeChecked();
  await expect(page.locator(".layer.active")).toContainText(
    "オリジナル・リング",
  );
  await expect(
    page.getByRole("button", { name: "マスクをリセット" }),
  ).toBeDisabled();
  // Editing the copy must not modify the preceding photograph.
  await page.getByLabel("outer blur").fill("18");
  await page
    .getByRole("button", { name: "オリジナル・クロス Original Cross" })
    .click();
  await expect(page.getByRole("status")).toContainText("顔が見つかりません");
  await page.getByLabel("X座標", { exact: true }).fill("222");
  await expect(page.locator(".layers .layer:not(.background)")).toHaveCount(2);
  await page.getByRole("button", { name: "前の写真", exact: true }).click();
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("321");
  await expect(page.getByLabel("前後回転（X軸）")).toHaveValue("30");
  await expect(page.getByLabel("左右回転（Y軸）")).toHaveValue("-10");
  await expect(page.getByLabel("outer blur")).toHaveValue("46");
  await expect(
    page.getByRole("button", { name: "マスクをリセット" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "↶", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "保存して次へ", exact: true }).click();
  await expect(queue).toHaveValue("1");
  await expect(page.getByRole("status")).toContainText("photo1_addhalo_2.png");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("222");
  await expect(queue.locator("option").first()).toContainText("保存済み");
  if (process.env.HALO_SCREENSHOT) {
    await page.locator(".right").evaluate((panel) => {
      panel.scrollTop = 0;
    });
    await page.screenshot({
      path: process.env.HALO_SCREENSHOT,
      fullPage: true,
    });
  }
  await page.getByLabel("出力形式").selectOption("jpeg");
  await page.getByRole("button", { name: "書き出す" }).click();
  await expect(page.getByRole("status")).toContainText("photo2_addhalo.jpg");
  const saved = await page.evaluate(async (names) => {
    const s = (window as any).__folderTest,
      bitmap = await createImageBitmap(
        await (
          await s.directory.getFileHandle("photo1_addhalo_2.png")
        ).getFile(),
      );
    const dimensions = [bitmap.width, bitmap.height];
    bitmap.close();
    const original: Record<string, number[]> = {};
    for (const name of names)
      original[name] = Array.from(
        new Uint8Array(
          await (
            await (await s.directory.getFileHandle(name)).getFile()
          ).arrayBuffer(),
        ),
      );
    const jpeg = await (
      await s.directory.getFileHandle("photo2_addhalo.jpg")
    ).getFile();
    return {
      original,
      dimensions,
      jpegType: jpeg.type,
      existing: await (await s.directory.getFileHandle("photo1_addhalo.png"))
        .getFile()
        .then((f: File) => f.text()),
      picks: s.picks,
      activation: s.activation,
      options: s.options,
    };
  }, Object.keys(originals));
  expect(saved.original).toEqual(originals);
  expect(saved.dimensions).toEqual([800, 1000]);
  expect(saved.jpegType).toBe("image/jpeg");
  expect(saved.existing).toBe("KEEP EXISTING OUTPUT");
  expect(saved.picks).toBe(1);
  expect(saved.activation).toEqual([true]);
  expect(saved.options).toEqual([{ id: "halo-photos", mode: "readwrite" }]);
  await page.getByRole("button", { name: "前の写真", exact: true }).click();
  await page.getByLabel("X座標", { exact: true }).fill("322");
  await expect(page.locator(".folder-heading")).toContainText("変更あり");
  await page.evaluate(() => {
    (window as any).__folderTest.denied = true;
  });
  await page.getByRole("button", { name: "保存して次へ", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "保存が許可されていません",
  );
  await expect(queue).toHaveValue("0");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("322");
  await page.evaluate(() => {
    (window as any).__folderTest.denied = false;
    (window as any).__folderTest.cancel = true;
  });
  await page
    .getByRole("button", { name: "フォルダーを開く", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("キャンセル");
  await expect(queue).toHaveValue("0");
  await queue.selectOption("2");
  await expect(page.getByRole("status")).toContainText("photo10.jpg");
  await page.getByLabel("出力形式").selectOption("png");
  await page.getByRole("button", { name: "保存して完了", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("photo10_addhalo.png");
  await expect(queue).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "次の写真", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("322");
  await expect(page.getByLabel("outer blur")).toHaveValue("46");
  await expect(
    page.getByRole("button", { name: "マスクをリセット" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await queue.selectOption("0");
  await queue.selectOption("2");
  await expect(page.getByLabel("X座標", { exact: true })).toBeDisabled();
  await expect(page.locator(".layers .layer:not(.background)")).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__folderTest.cancel = false;
  });
  await page
    .getByRole("button", { name: "フォルダーを開く", exact: true })
    .click();
  await expect(queue).toHaveValue("0");
  await expect(page.getByLabel("X座標", { exact: true })).toBeDisabled();
});

test("single-file export validates source folder, keeps edits on cancel and writes a new file", async ({
  page,
}) => {
  const { originals } = await fixture(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "photo2.png",
      mimeType: "image/png",
      buffer: Buffer.from(originals["photo2.png"]),
    });
  await expect(page.getByRole("status")).toContainText("photo2.png");
  await page.evaluate(() => {
    (window as any).__folderTest.useWrong = true;
  });
  await page.getByRole("button", { name: "書き出す" }).click();
  await expect(page.getByRole("status")).toContainText(
    "同名ですが読み込み元と異なる",
  );
  await page.evaluate(() => {
    (window as any).__folderTest.useWrong = false;
    (window as any).__folderTest.cancel = true;
  });
  await page.getByRole("button", { name: "書き出す" }).click();
  await expect(page.getByRole("status")).toContainText("キャンセル");
  await page.evaluate(() => {
    (window as any).__folderTest.cancel = false;
  });
  await page.getByRole("button", { name: "書き出す" }).click();
  await expect(page.getByRole("status")).toContainText("photo2_addhalo.png");
  await page.getByRole("button", { name: "書き出す" }).click();
  await expect(page.getByRole("status")).toContainText("photo2_addhalo_2.png");
  const result = await page.evaluate(async () => {
    const s = (window as any).__folderTest;
    const wrongNames = [];
    for await (const name of s.wrong.keys()) wrongNames.push(name);
    const source = await (
      await s.directory.getFileHandle("photo2.png")
    ).getFile();
    return {
      picks: s.picks,
      activation: s.activation,
      wrongNames,
      source: Array.from(new Uint8Array(await source.arrayBuffer())),
    };
  });
  expect(result.wrongNames).toEqual(["photo2.png"]);
  expect(result.source).toEqual(originals["photo2.png"]);
  expect(result.picks).toBe(3);
  expect(result.activation.every(Boolean)).toBe(true);
});

test("built app save-and-next inherits glow and transforms through real File System handles", async ({
  page,
}) => {
  const url = process.env.HALO_PRODUCTION_URL;
  test.skip(!url, "HALO_PRODUCTION_URLを指定してください。");
  const origin = new URL(url!).origin,
    external: string[] = [];
  await page.route("**/*", async (r) => {
    if (
      /^https?:/.test(r.request().url()) &&
      new URL(r.request().url()).origin !== origin
    ) {
      external.push(r.request().url());
      await r.abort();
    } else await r.continue();
  });
  await fixture(page, url!);
  await page
    .getByRole("button", { name: "フォルダーを開く", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("photo1.webp");
  await page
    .getByRole("button", { name: "オリジナル・リング Original Ring" })
    .click();
  await expect(page.getByRole("status")).toContainText("顔が見つかりません");
  await page.getByLabel("X座標", { exact: true }).fill("279");
  await page.getByLabel("前後回転（X軸）").fill("25");
  await page.getByLabel("outer blur").fill("51");
  await page.getByLabel("発光を有効").uncheck();
  await page.getByRole("button", { name: "保存して次へ", exact: true }).click();
  await expect(page.getByLabel("フォルダー内の写真")).toHaveValue("1");
  await expect(page.getByRole("status")).toContainText("photo1_addhalo_2.png");
  await expect(page.getByLabel("X座標", { exact: true })).toHaveValue("279");
  await expect(page.getByLabel("前後回転（X軸）")).toHaveValue("25");
  await expect(page.getByLabel("outer blur")).toHaveValue("51");
  await expect(page.getByLabel("発光を有効")).not.toBeChecked();
  await expect(page.locator(".layer.active")).toContainText(
    "オリジナル・リング",
  );
  expect(
    await page.evaluate(
      async () =>
        (
          await (
            await (window as any).__folderTest.directory.getFileHandle(
              "photo1_addhalo_2.png",
            )
          ).getFile()
        ).size,
    ),
  ).toBeGreaterThan(1000);
  expect(external).toEqual([]);
});
