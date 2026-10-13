import { test, expect } from "@playwright/test";
test("Phase 4: ZIP restores masks, glow, vector, transforms and pixels", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { readPhoto, importAsset, image, surface } =
      await import("/src/images.ts");
    const { saveProject, loadProject } = await import("/src/project.ts");
    const { exportImage } = await import("/src/render.ts");
    const { defaultGlow } = await import("/src/model.ts");
    const c = surface(4000, 6000);
    c.getContext("2d")!.fillRect(0, 0, 4000, 6000);
    const b = await new Promise<Blob>((r) => c.toBlob((b) => r(b!)));
    const photo = await readPhoto(new File([b], "original.png"));
    const a = await importAsset(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><ellipse cx="300" cy="200" rx="170" ry="80" stroke="#a1eeff" stroke-width="9" fill="none"/></svg>',
        ],
        "halo.svg",
      ),
    );
    const p = {
      version: 1,
      photo,
      assets: [a],
      layers: [
        {
          id: "l",
          assetId: a.id,
          name: "test",
          x: 2300,
          y: 1800,
          width: 1400,
          height: 600,
          angle: 17,
          skewX: 11,
          skewY: -5,
          opacity: 0.8,
          visible: true,
          manual: true,
          glow: { ...structuredClone(defaultGlow), color: "#ffaa55" },
          mask: [
            {
              mode: "hide",
              size: 0.2,
              hardness: 0.7,
              points: [
                { x: 0, y: 0.5 },
                { x: 0.3, y: 0.6 },
              ],
            },
          ],
        },
      ],
    };
    const restored = await loadProject(
      new File([await saveProject(p)], "project.zip"),
    );
    const before = await exportImage(p, "halo"),
      after = await exportImage(restored, "halo");
    const beforeBytes = new Uint8Array(await before.arrayBuffer()),
      afterBytes = new Uint8Array(await after.arrayBuffer());
    const equal =
      beforeBytes.length === afterBytes.length &&
      beforeBytes.every((v, i) => v === afterBytes[i]);
    const jpeg = await exportImage(restored, "jpeg");
    const jpegImage = await image(URL.createObjectURL(jpeg));
    const halo = await image(URL.createObjectURL(after));
    const out = surface(4000, 6000);
    out.getContext("2d")!.drawImage(halo, 0, 0);
    const alpha = out.getContext("2d")!.getImageData(0, 0, 1, 1).data[3];
    return {
      equal,
      mask: restored.layers[0].mask,
      glow: restored.layers[0].glow.color,
      position: restored.layers[0].x,
      svg: !!restored.assets[0].svg,
      width: jpegImage.width,
      height: jpegImage.height,
      alpha,
      original: restored.photo!.data === photo.data,
    };
  });
  expect(result.equal).toBe(true);
  expect(result.mask).toHaveLength(1);
  expect(result.glow).toBe("#ffaa55");
  expect(result.position).toBe(2300);
  expect(result.svg).toBe(true);
  expect([result.width, result.height]).toEqual([4000, 6000]);
  expect(result.alpha).toBe(0);
  expect(result.original).toBe(true);
});
test("external SVG strips script, events, style and external references", async ({
  page,
}) => {
  await page.goto("/");
  const r = await page.evaluate(async () => {
    const { sanitizeSvg, importAsset } = await import("/src/images.ts");
    const raw =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" onload="alert(1)"><script>alert(1)</script><foreignObject/><style>@import url(https://evil.test/)</style><image href="https://evil.test/photo"/><rect x="100" y="150" width="200" height="50" fill="red" onclick="alert(2)"/><path d="M0 0" fill="url(https://evil.test/)"/></svg>';
    const clean = sanitizeSvg(raw);
    const a = await importAsset(new File([raw], "unsafe.svg"));
    let rejected = false;
    try {
      sanitizeSvg("<!DOCTYPE svg><svg/>");
    } catch {
      rejected = true;
    }
    return { clean, ratio: a.width / a.height, rejected };
  });
  expect(r.clean).not.toMatch(
    /script|onload|onclick|foreignObject|https:\/\/evil|<style|<image/,
  );
  expect(r.ratio).toBeCloseTo(4, 1);
  expect(r.rejected).toBe(true);
});
test("reloading same asset ID with changed pixels invalidates image cache", async ({
  page,
}) => {
  await page.goto("/");
  const colors = await page.evaluate(async () => {
    const { importAsset, assetImage, surface } = await import("/src/images.ts");
    const create = (color: string) =>
      new File(
        [
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="${color}"/></svg>`,
        ],
        "color.svg",
      );
    const red = await importAsset(create("#ff0000")),
      blue = await importAsset(create("#0000ff"));
    blue.id = red.id;
    const one = await assetImage(red, 100),
      two = await assetImage(blue, 100);
    const pixel = (img: HTMLImageElement) => {
      const c = surface(1, 1);
      c.getContext("2d")!.drawImage(img, 0, 0, 1, 1);
      return [...c.getContext("2d")!.getImageData(0, 0, 1, 1).data];
    };
    return [pixel(one), pixel(two)];
  });
  expect(colors).toEqual([
    [255, 0, 0, 255],
    [0, 0, 255, 255],
  ]);
});
test("EXIF orientation 6 decodes upright and changes dimensions", async ({
  page,
}) => {
  await page.goto("/");
  const size = await page.evaluate(async () => {
    const { readPhoto, surface } = await import("/src/images.ts");
    const c = surface(120, 80);
    c.getContext("2d")!.fillRect(0, 0, 120, 80);
    const blob = await new Promise<Blob>((r) =>
      c.toBlob((b) => r(b!), "image/jpeg"),
    );
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const app1 = new Uint8Array([
      255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 77, 77, 0, 42, 0, 0, 0, 8, 0, 1,
      1, 18, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0,
    ]);
    const bytes = new Uint8Array(jpeg.length + app1.length);
    bytes.set(jpeg.slice(0, 2));
    bytes.set(app1, 2);
    bytes.set(jpeg.slice(2), app1.length + 2);
    const p = await readPhoto(new File([bytes], "rotated.jpg"));
    return [p.width, p.height];
  });
  expect(size).toEqual([80, 120]);
});
test("glow geometry remains aligned between preview and full resolution", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { importAsset, surface } = await import("/src/images.ts");
    const { objectFor } = await import("/src/render.ts");
    const { defaultGlow } = await import("/src/model.ts");
    const a = await importAsset(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><ellipse cx="150" cy="50" rx="130" ry="35" stroke="white" stroke-width="6" fill="none"/></svg>',
        ],
        "halo.svg",
      ),
    );
    const l = {
      id: "l",
      assetId: a.id,
      name: "test",
      x: 1700,
      y: 2500,
      width: 1400,
      height: 700,
      angle: 21,
      skewX: 12,
      skewY: -4,
      opacity: 1,
      visible: true,
      manual: false,
      mask: [],
      glow: structuredClone(defaultGlow),
    };
    async function centroid(quality: number) {
      const o = await objectFor(a, l, quality),
        c = surface(4000, 6000),
        x = c.getContext("2d")!;
      x.transform(...o.calcTransformMatrix());
      x.drawImage(o.getElement(), -o.width / 2, -o.height / 2);
      const data = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0,
        sx = 0,
        sy = 0;
      for (let y = 0; y < c.height; y++)
        for (let p = 0; p < c.width; p++) {
          const alpha = data[(y * c.width + p) * 4 + 3];
          n += alpha;
          sx += p * alpha;
          sy += y * alpha;
        }
      return { x: sx / n, y: sy / n };
    }
    return { preview: await centroid(512), full: await centroid(2000) };
  });
  expect(Math.abs(result.preview.x - result.full.x)).toBeLessThan(1);
  expect(Math.abs(result.preview.y - result.full.y)).toBeLessThan(1);
});
