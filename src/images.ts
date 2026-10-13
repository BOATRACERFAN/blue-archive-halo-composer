import type { Asset, Photo } from "./model";
import { defaultPreset, id } from "./model";
export const surface = (w: number, h: number) => {
  if (w * h > 100_000_000 || w > 32760 || h > 32760)
    throw Error("画像が大きすぎます（最大1億画素・一辺32760px）。");
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};
export const readData = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(Error("ファイルを読み込めません。"));
    r.readAsDataURL(b);
  });
export const image = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(Error("画像をデコードできません。"));
    i.src = url;
  });
export async function readPhoto(file: File): Promise<Photo> {
  if (!/\.(jpe?g|png|webp)$/i.test(file.name))
    throw Error("写真はJPEG / PNG / WebPを選択してください。");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const c = surface(bitmap.width, bitmap.height);
    c.getContext("2d")!.drawImage(bitmap, 0, 0);
    return {
      name: file.name,
      data: c.toDataURL("image/png"),
      width: c.width,
      height: c.height,
    };
  } finally {
    bitmap.close();
  }
}
const tags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "title",
  "desc",
]);
const attrs = new Set([
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "fill-rule",
  "clip-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
  "id",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "fx",
  "fy",
  "clip-path",
  "preserveAspectRatio",
]);
export function sanitizeSvg(raw: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw))
    throw Error("DOCTYPE / ENTITYを含むSVGは読み込めません。");
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg"
  )
    throw Error("SVGの形式が不正です。");
  let count = 0;
  function clean(e: Element) {
    if (++count > 20000) throw Error("SVGの要素数が多すぎます。");
    for (const child of Array.from(e.children)) {
      if (!tags.has(child.localName)) {
        child.remove();
        continue;
      }
      clean(child);
    }
    const style = e.getAttribute("style");
    if (style) {
      for (const entry of style.split(";")) {
        const i = entry.indexOf(":");
        if (i < 0) continue;
        const name = entry.slice(0, i).trim(),
          value = entry.slice(i + 1).trim();
        if (
          attrs.has(name) &&
          name !== "id" &&
          name !== "xmlns" &&
          name !== "viewBox" &&
          name !== "transform"
        )
          e.setAttribute(name, value);
      }
    }
    for (const a of Array.from(e.attributes)) {
      if (
        !attrs.has(a.name) ||
        /javascript:|data:|https?:|file:|\/\//i.test(a.value) ||
        (/url\s*\(/i.test(a.value) && !/^url\(#[A-Za-z0-9_-]+\)$/.test(a.value))
      )
        e.removeAttribute(a.name);
    }
  }
  clean(doc.documentElement);
  const root = doc.documentElement;
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!root.hasAttribute("viewBox")) {
    const w = parseFloat(root.getAttribute("width") || "512"),
      h = parseFloat(root.getAttribute("height") || "512");
    if (!(w > 0 && h > 0)) throw Error("SVGサイズが不正です。");
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  const vb = root
    .getAttribute("viewBox")!
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0)
    throw Error("SVGのviewBoxが不正です。");
  root.setAttribute("width", String(2048));
  root.setAttribute(
    "height",
    String(Math.max(1, Math.round((2048 * vb[3]) / vb[2]))),
  );
  if (vb[3] / vb[2] > 16 || vb[2] / vb[3] > 16)
    throw Error("SVGの縦横比が極端です。");
  return new XMLSerializer().serializeToString(root);
}
export async function importAsset(file: File): Promise<Asset> {
  if (file.size > 20_000_000) throw Error("素材は20MB以下にしてください。");
  let svg: string | undefined;
  let url: string;
  if (/\.svg$/i.test(file.name)) {
    svg = sanitizeSvg(await file.text());
    url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  } else if (/\.png$/i.test(file.name)) url = await readData(file);
  else throw Error("素材はSVG / 透過PNGを選択してください。");
  const img = await image(url);
  const s = Math.min(1, 2048 / Math.max(img.width, img.height));
  const c = surface(img.width * s, img.height * s),
    ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const a = ctx.getImageData(0, 0, c.width, c.height).data;
  let x = c.width,
    y = c.height,
    x2 = -1,
    y2 = -1;
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++)
      if (a[(j * c.width + i) * 4 + 3] > 0) {
        x = Math.min(x, i);
        y = Math.min(y, j);
        x2 = Math.max(x2, i);
        y2 = Math.max(y2, j);
      }
  if (x2 < 0) throw Error("可視形状がありません。");
  const crop = {
    x: x / c.width,
    y: y / c.height,
    w: (x2 - x + 1) / c.width,
    h: (y2 - y + 1) / c.height,
  };
  const original = surface(
    Math.ceil(img.width * crop.w),
    Math.ceil(img.height * crop.h),
  );
  original
    .getContext("2d")!
    .drawImage(
      img,
      img.width * crop.x,
      img.height * crop.y,
      img.width * crop.w,
      img.height * crop.h,
      0,
      0,
      original.width,
      original.height,
    );
  return {
    id: id(),
    ja: file.name.replace(/\.[^.]+$/, ""),
    en: "",
    data: original.toDataURL("image/png"),
    svg,
    width: original.width,
    height: original.height,
    crop,
    preset: { ...defaultPreset },
  };
}
const cache = new Map<string, { asset: Asset; image: HTMLImageElement }>();
export async function assetImage(asset: Asset, targetWidth = 1024) {
  const w = Math.max(
    1,
    Math.min(
      Math.floor(8192 * Math.min(1, asset.width / asset.height)),
      Math.max(64, Math.ceil(targetWidth)),
    ),
  );
  const key = asset.id + ":" + (asset.svg ? w : 0);
  const existing = cache.get(key);
  if (
    existing &&
    existing.asset.data === asset.data &&
    existing.asset.svg === asset.svg &&
    existing.asset.width === asset.width &&
    existing.asset.height === asset.height &&
    JSON.stringify(existing.asset.crop) === JSON.stringify(asset.crop)
  )
    return existing.image;
  let src = asset.data;
  if (asset.svg && asset.crop) {
    const doc = new DOMParser().parseFromString(asset.svg, "image/svg+xml");
    const vb = doc.documentElement
      .getAttribute("viewBox")!
      .split(/[\s,]+/)
      .map(Number);
    const p = asset.crop;
    doc.documentElement.setAttribute(
      "viewBox",
      `${vb[0] + p.x * vb[2]} ${vb[1] + p.y * vb[3]} ${p.w * vb[2]} ${p.h * vb[3]}`,
    );
    doc.documentElement.setAttribute("width", String(w));
    doc.documentElement.setAttribute(
      "height",
      String(Math.ceil((w * asset.height) / asset.width)),
    );
    src =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(new XMLSerializer().serializeToString(doc));
  }
  const img = await image(src);
  const pixels = [...cache.values()].reduce(
    (n, v) => n + v.image.width * v.image.height,
    0,
  );
  if (cache.size > 24 || pixels + img.width * img.height > 16_000_000)
    cache.clear();
  if (img.width * img.height <= 16_000_000)
    cache.set(key, { asset, image: img });
  return img;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const toBlob = (
  c: HTMLCanvasElement,
  type = "image/png",
): Promise<Blob> =>
  new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(Error("書き出しに失敗しました。"))),
      type,
      0.95,
    ),
  );
