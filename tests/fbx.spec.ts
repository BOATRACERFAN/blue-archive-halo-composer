import { test, expect } from "@playwright/test";
import { ringFbx } from "./fbx-fixture";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
test("FBX: actual geometry rotates, glow/mask and ZIP restore original data", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (raw) => {
    const { importFbx, modelImage } = await import("/src/threeAssets.ts");
    const { defaultGlow } = await import("/src/model.ts");
    const { tile, exportImage } = await import("/src/render.ts");
    const { saveProject, loadProject } = await import("/src/project.ts");
    const { readPhoto, surface } = await import("/src/images.ts");
    const a = await importFbx(new File([raw], "original-ring.fbx"));
    const layer = {
      id: "l",
      assetId: a.id,
      name: "ring",
      x: 1000,
      y: 1200,
      width: 1200,
      height: 1200,
      angle: 12,
      pitch: 60,
      yaw: 25,
      skewX: 0,
      skewY: 0,
      opacity: 0.8,
      visible: true,
      manual: true,
      glow: structuredClone(defaultGlow),
      mask: [],
    };
    function stats(c: HTMLCanvasElement) {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0,
        ymin = c.height,
        ymax = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const alpha = d[(y * c.width + x) * 4 + 3];
          n += alpha;
          if (alpha > 128) {
            ymin = Math.min(ymin, y);
            ymax = Math.max(ymax, y);
          }
        }
      return { alpha: n, height: ymax - ymin };
    }
    const front = stats(await modelImage(a, {}, 512)),
      tilted = stats(await modelImage(a, { pitch: 60, yaw: 25 }, 512));
    const normal = await tile(a, layer, 512),
      masked = await tile(
        a,
        {
          ...layer,
          mask: [
            {
              mode: "hide",
              size: 1,
              hardness: 1,
              points: [
                { x: 0, y: 0.5 },
                { x: 1, y: 0.5 },
              ],
            },
          ],
        },
        512,
      );
    const c = surface(4000, 6000),
      blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!))),
      photo = await readPhoto(new File([blob], "photo.png"));
    layer.mask = [
      { mode: "hide", size: 0.3, hardness: 0.8, points: [{ x: 0.2, y: 0.3 }] },
    ];
    const p = { version: 1, photo, assets: [a], layers: [layer] },
      restored = await loadProject(
        new File([await saveProject(p)], "project.zip"),
      );
    const one = new Uint8Array(
        await (await exportImage(p, "halo")).arrayBuffer(),
      ),
      two = new Uint8Array(
        await (await exportImage(restored, "halo")).arrayBuffer(),
      );
    return {
      front,
      tilted,
      masked: stats(masked.canvas).alpha,
      normal: stats(normal.canvas).alpha,
      original: restored.assets[0].fbx === a.fbx,
      pitch: restored.layers[0].pitch,
      yaw: restored.layers[0].yaw,
      mask: restored.layers[0].mask.length,
      equal: one.length === two.length && one.every((v, i) => v === two[i]),
    };
  }, ringFbx());
  expect(result.front.alpha).toBeGreaterThan(0);
  expect(result.tilted.height).toBeLessThan(result.front.height * 0.8);
  expect(result.masked).toBeLessThan(result.normal * 0.1);
  expect(result.original).toBe(true);
  expect([result.pitch, result.yaw, result.mask]).toEqual([60, 25, 1]);
  expect(result.equal).toBe(true);
});
test("FBX textures stay local; missing external references warn without requests", async ({
  page,
}) => {
  const external: string[] = [];
  await page.route("**/*", async (r) => {
    if (
      /^https?:/.test(r.request().url()) &&
      !r.request().url().startsWith("http://127.0.0.1:5173/")
    ) {
      external.push(r.request().url());
      await r.abort();
    } else await r.continue();
  });
  await page.goto("/");
  const result = await page.evaluate(async (raw) => {
    const { importFbx, modelImage } = await import("/src/threeAssets.ts");
    const missing = await importFbx(new File([raw], "ring.fbx"));
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 4, 4);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)));
    const local = await importFbx(new File([raw], "local-ring.fbx"), [
      new File([blob], "halo-color.png"),
    ]);
    const { saveProject, loadProject, loadLibrary } =
      await import("/src/project.ts");
    const p = {
      version: 1,
      photo: null,
      assets: [{ ...local, id: local.id + "zip" }],
      layers: [],
    };
    const restored = await loadProject(
      new File([await saveProject(p)], "textures.zip"),
    );
    const library = await loadLibrary(
      new File(
        [JSON.stringify([{ ...local, id: local.id + "library" }])],
        "materials.json",
      ),
    );
    const img = await modelImage(restored.assets[0], {}, 256);
    const d = img
      .getContext("2d")!
      .getImageData(0, 0, img.width, img.height).data;
    let red = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] > 100 && d[i] > d[i + 1] * 2 && d[i + 3] > 100) red++;
    return {
      missing: missing.warnings,
      local: local.warnings,
      textures: local.textures.length,
      textureEqual:
        restored.assets[0].textures[0].data === local.textures[0].data &&
        library[0].textures[0].data === local.textures[0].data,
      red,
    };
  }, ringFbx("https://blocked.invalid/halo-color.png"));
  expect(result.missing.length).toBeGreaterThan(0);
  expect(result.local).toEqual([]);
  expect(result.red).toBeGreaterThan(100);
  expect(result.textures).toBe(1);
  expect(result.textureEqual).toBe(true);
  expect(external).toEqual([]);
});
test("UI: FBX import, locked numeric/corner scaling, pitch/yaw undo and PNG tilt", async ({
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
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
  await expect(page.getByRole("status")).toContainText("photo.png");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "custom.fbx",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(ringFbx()),
    });
  await expect(
    page.getByRole("button", { name: "custom インポート素材" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "custom インポート素材" }).click();
  await expect(page.getByRole("status")).toContainText("顔が見つかりません");
  await page.getByLabel("幅", { exact: true }).fill("250");
  await expect(page.getByLabel("高さ", { exact: true })).toHaveValue("250");
  await page.getByLabel("高さ", { exact: true }).fill("300");
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("300");
  await page.getByLabel("前後回転（X軸）").fill("55");
  await page.getByLabel("左右回転（Y軸）").fill("-20");
  await page.getByRole("button", { name: "↶", exact: true }).click();
  await expect(page.getByLabel("左右回転（Y軸）")).toHaveValue("0");
  await expect(page.getByLabel("前後回転（X軸）")).toHaveValue("55");
  await page.getByRole("button", { name: "前後・左右回転をリセット" }).click();
  await expect(page.getByLabel("前後回転（X軸）")).toHaveValue("0");
  await page.getByLabel("発光を有効").uncheck();
  await page.getByLabel("X座標", { exact: true }).fill("400");
  await page.getByLabel("Y座標", { exact: true }).fill("500");
  await page.getByLabel("表示倍率").selectOption("0.5");
  const canvas = page.locator("canvas.lower-canvas"),
    box = (await canvas.boundingBox())!;
  await expect
    .poll(async () => {
      return canvas.evaluate((c) =>
        (c as HTMLCanvasElement)
          .getContext("2d")!
          .getImageData(
            0,
            0,
            (c as HTMLCanvasElement).width,
            (c as HTMLCanvasElement).height,
          )
          .data.some((n) => n > 0),
      );
    })
    .toBe(true);
  for (const shifted of [false, true]) {
    const width = Number(
        await page.getByLabel("幅", { exact: true }).inputValue(),
      ),
      x = Number(await page.getByLabel("X座標", { exact: true }).inputValue()),
      y = Number(await page.getByLabel("Y座標", { exact: true }).inputValue());
    const cx = box.x + (x + width / 2) * 0.5,
      cy = box.y + (y + width / 2) * 0.5;
    if (shifted) await page.keyboard.down("Shift");
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 35, cy + 15, { steps: 6 });
    await page.mouse.up();
    if (shifted) await page.keyboard.up("Shift");
    await expect
      .poll(async () =>
        Number(await page.getByLabel("幅", { exact: true }).inputValue()),
      )
      .toBeGreaterThan(width + 5);
    expect(
      Number(await page.getByLabel("高さ", { exact: true }).inputValue()) /
        Number(await page.getByLabel("幅", { exact: true }).inputValue()),
    ).toBeCloseTo(1, 3);
  }
  await page
    .getByRole("button", { name: "オリジナル・リング Original Ring" })
    .click();
  const ratio =
    Number(await page.getByLabel("高さ", { exact: true }).inputValue()) /
    Number(await page.getByLabel("幅", { exact: true }).inputValue());
  await page.getByLabel("幅", { exact: true }).fill("400");
  expect(
    Number(await page.getByLabel("高さ", { exact: true }).inputValue()) / 400,
  ).toBeCloseTo(ratio, 3);
  await page.getByLabel("前後回転（X軸）").fill("45");
  await page.getByLabel("出力形式").selectOption("halo");
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  expect((await d).suggestedFilename()).toBe("photo_addhalo.png");
});

test("Binary FBX 7.4 with embedded texture renders offline", async ({
  page,
}) => {
  const path =
    process.env.HALO_TEST_FBX || "../../work/monkey_embedded_texture.fbx";
  test.skip(
    !existsSync(path),
    "HALO_TEST_FBXに埋め込みテクスチャのあるFBXを指定してください。",
  );
  const raw = await readFile(path);
  expect(raw.subarray(0, 18).toString()).toBe("Kaydara FBX Binary");
  const external: string[] = [];
  await page.route("**/*", async (r) => {
    if (
      /^https?:/.test(r.request().url()) &&
      !r.request().url().startsWith("http://127.0.0.1:5173/")
    ) {
      external.push(r.request().url());
      await r.abort();
    } else await r.continue();
  });
  await page.goto("/");
  const result = await page.evaluate(async (bytes) => {
    const { importFbx, fbxGroup, modelImage } =
      await import("/src/threeAssets.ts");
    const { saveProject, loadProject } = await import("/src/project.ts");
    const a = await importFbx(
      new File([new Uint8Array(bytes)], "embedded.fbx"),
    );
    const p = {
      version: 1,
      photo: null,
      assets: [{ ...a, id: a.id + "restored" }],
      layers: [],
    };
    const restored = await loadProject(
      new File([await saveProject(p)], "model.zip"),
    );
    const group = await fbxGroup(restored.assets[0]);
    let textured = 0;
    group.traverse((o) => {
      if (o.isMesh) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (m.map?.image?.width > 1) textured++;
      }
    });
    const c = await modelImage(restored.assets[0], { pitch: 25, yaw: 35 }, 512);
    const data = c.getContext("2d")!.getImageData(0, 0, 512, 512).data;
    let pixels = 0;
    const shades = new Set<number>();
    for (let i = 0; i < data.length; i += 4)
      if (data[i + 3] > 128) {
        pixels++;
        shades.add(Math.round(data[i] / 16));
      }
    return {
      textured,
      pixels,
      shades: shades.size,
      warnings: restored.assets[0].warnings,
      source: a.fbx === restored.assets[0].fbx,
    };
  }, Array.from(raw));
  expect(result.textured).toBeGreaterThan(0);
  expect(result.pixels).toBeGreaterThan(100);
  expect(result.shades).toBeGreaterThan(3);
  expect(result.warnings).toEqual([]);
  expect(result.source).toBe(true);
  expect(external).toEqual([]);
});

test("built app imports and rotates FBX with all external HTTP blocked", async ({
  page,
}) => {
  const url = process.env.HALO_PRODUCTION_URL;
  test.skip(!url, "HALO_PRODUCTION_URLを指定してください。");
  const origin = new URL(url!).origin,
    external: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (r) => {
    if (
      /^https?:/.test(r.request().url()) &&
      new URL(r.request().url()).origin !== origin
    ) {
      external.push(r.request().url());
      await r.abort();
    } else await r.continue();
  });
  await page.goto(url!);
  await expect(
    page.getByText("オリジナル・リング", { exact: true }),
  ).toBeVisible();
  const photo = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 1000;
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
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(photo),
    });
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "offline.fbx",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(ringFbx()),
    });
  await page.getByRole("button", { name: "offline インポート素材" }).click();
  await expect(page.getByRole("status")).toContainText("顔が見つかりません");
  await page.getByLabel("前後回転（X軸）").fill("60");
  await page.getByLabel("左右回転（Y軸）").fill("20");
  await page.getByLabel("出力形式").selectOption("halo");
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  const download = await waiting,
    stream = await download.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const png = Buffer.concat(chunks);
  expect(png.readUInt32BE(16)).toBe(800);
  expect(png.readUInt32BE(20)).toBe(1000);
  expect(png.length).toBeGreaterThan(1000);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
