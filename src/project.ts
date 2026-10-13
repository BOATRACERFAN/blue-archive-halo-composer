import JSZip from "jszip";
import { z } from "zod";
import type { Project, Asset } from "./model";
import { image, readData, sanitizeSvg } from "./images";
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const part = z.object({
  brightness: num(0, 4),
  opacity: num(0, 1),
  blur: num(0, 100),
});
const preset = z.object({
  up: num(-10, 10),
  side: num(-10, 10),
  ratio: num(0.1, 10),
  angle: num(-180, 180),
  rotate: z.boolean(),
});
const asset = z.object({
  id: z.string().min(1).max(100),
  ja: z.string().max(100),
  en: z.string().max(100),
  data: z.string().max(200_000_000),
  svg: z.string().max(10_000_000).optional(),
  fbx: z.string().max(30_000_000).optional(),
  textures: z
    .array(
      z.object({
        name: z.string().max(260),
        data: z.string().max(15_000_000),
        type: z.enum(["image/png", "image/jpeg", "image/webp"]),
      }),
    )
    .max(32)
    .optional(),
  warnings: z.array(z.string().max(500)).max(100).optional(),
  width: num(1, 32760),
  height: num(1, 32760),
  crop: z
    .object({
      x: num(0, 1),
      y: num(0, 1),
      w: num(0.000001, 1),
      h: num(0.000001, 1),
    })
    .optional(),
  preset,
});
const layer = z.object({
  id: z.string().max(100),
  assetId: z.string().max(100),
  name: z.string().max(150),
  x: num(-100000, 100000),
  y: num(-100000, 100000),
  width: num(1, 20000),
  height: num(1, 20000),
  angle: num(-3600, 3600),
  pitch: num(-180, 180).default(0),
  yaw: num(-180, 180).default(0),
  skewX: num(-80, 80),
  skewY: num(-80, 80),
  opacity: num(0, 1),
  visible: z.boolean(),
  manual: z.boolean(),
  glow: z.object({
    enabled: z.boolean(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    strength: num(0, 4),
    radius: num(0, 4),
    blend: z.enum(["source-over", "screen", "lighter"]),
    core: part,
    inner: part,
    outer: part,
  }),
  mask: z
    .array(
      z.object({
        mode: z.enum(["hide", "restore"]),
        size: num(0.000001, 100),
        hardness: num(0, 1),
        points: z
          .array(z.object({ x: num(-100, 100), y: num(-100, 100) }))
          .min(1)
          .max(100000),
      }),
    )
    .max(2000),
});
const schema = z.object({
  version: z.literal(1),
  photo: z
    .object({
      name: z.string().max(200),
      data: z.string().max(300_000_000),
      width: num(1, 32760),
      height: num(1, 32760),
    })
    .nullable(),
  assets: z.array(asset).max(200),
  layers: z.array(layer).max(100),
});
async function validateAssets(assets: Asset[]) {
  if (new Set(assets.map((a) => a.id)).size !== assets.length)
    throw Error("素材IDが重複しています。");
  for (const a of assets) {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.data))
      throw Error("プロジェクト素材はPNGである必要があります。");
    const img = await image(a.data);
    if (img.width !== a.width || img.height !== a.height)
      throw Error("素材サイズが一致しません。");
    if (a.svg) a.svg = sanitizeSvg(a.svg);
    if (a.fbx) {
      if (
        a.svg ||
        !/^data:application\/octet-stream;base64,[A-Za-z0-9+/=]+$/.test(a.fbx)
      )
        throw Error("FBXデータが不正です。");
      for (const texture of a.textures || []) {
        if (
          !texture.data.startsWith("data:" + texture.type + ";base64,") ||
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
            texture.data,
          )
        )
          throw Error("FBXテクスチャデータが不正です。");
        await image(texture.data);
      }
      const { fbxGroup } = await import("./threeAssets");
      await fbxGroup(a);
    }
    if (
      a.crop &&
      (a.crop.x + a.crop.w > 1.00001 || a.crop.y + a.crop.h > 1.00001)
    )
      throw Error("素材トリミングが不正です。");
  }
}
export async function validateProject(raw: unknown): Promise<Project> {
  const p = schema.parse(raw);
  await validateAssets(p.assets);
  if (p.photo) {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.photo.data))
      throw Error("写真データが不正です。");
    const img = await image(p.photo.data);
    if (
      img.width !== p.photo.width ||
      img.height !== p.photo.height ||
      img.width * img.height > 100_000_000
    )
      throw Error("写真サイズが不正です。");
  }
  if (
    new Set(p.layers.map((l) => l.id)).size !== p.layers.length ||
    p.layers.some((l) => !p.assets.some((a) => a.id === l.assetId))
  )
    throw Error("レイヤーの素材参照が不正です。");
  if (
    p.layers.reduce(
      (n, l) => n + l.mask.reduce((s, m) => s + m.points.length, 0),
      0,
    ) > 300000
  )
    throw Error("マスクの点数が多すぎます。");
  return p;
}
function pngBytes(data: string) {
  const base = data.split(",")[1];
  return Uint8Array.from(atob(base), (c) => c.charCodeAt(0));
}
export async function saveProject(project: Project): Promise<Blob> {
  const zip = new JSZip();
  const p = structuredClone(project);
  if (p.photo) {
    zip.file("photo.png", pngBytes(p.photo.data));
    p.photo.data = "photo.png";
  }
  for (let i = 0; i < p.assets.length; i++) {
    const a = p.assets[i],
      path = `assets/${i}.png`;
    zip.file(path, pngBytes(a.data));
    a.data = path;
    if (a.fbx) {
      zip.file(`assets/${i}.fbx`, pngBytes(a.fbx));
      a.fbx = `assets/${i}.fbx`;
      for (let t = 0; t < (a.textures || []).length; t++) {
        const texture = a.textures![t],
          texturePath = `assets/${i}-texture-${t}.bin`;
        zip.file(texturePath, pngBytes(texture.data));
        texture.data = texturePath;
      }
    }
  }
  zip.file("project.json", JSON.stringify(p));
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 1 },
  });
}
function checkZip(bytes: ArrayBuffer) {
  const v = new DataView(bytes);
  let end = -1;
  for (let i = v.byteLength - 22; i >= Math.max(0, v.byteLength - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("ZIP形式が不正です。");
  const count = v.getUint16(end + 10, true);
  let pos = v.getUint32(end + 16, true),
    total = 0;
  if (count > 500 || count === 65535)
    throw Error("ZIPのファイル数が多すぎます。");
  for (let i = 0; i < count; i++) {
    if (pos + 46 > v.byteLength || v.getUint32(pos, true) !== 0x02014b50)
      throw Error("ZIPのディレクトリが不正です。");
    const size = v.getUint32(pos + 24, true);
    total += size;
    if (size > 200_000_000 || total > 400_000_000)
      throw Error("ZIPの展開サイズが大きすぎます。");
    pos +=
      46 +
      v.getUint16(pos + 28, true) +
      v.getUint16(pos + 30, true) +
      v.getUint16(pos + 32, true);
  }
}
export async function loadProject(file: File): Promise<Project> {
  if (file.size > 200_000_000)
    throw Error("プロジェクトZIPは200MB以下にしてください。");
  const bytes = await file.arrayBuffer();
  checkZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const manifest = zip.file("project.json");
  if (!manifest) throw Error("project.jsonが見つかりません。");
  const raw = await manifest.async("string");
  if (raw.length > 15_000_000) throw Error("プロジェクト設定が大きすぎます。");
  const p = schema.parse(JSON.parse(raw));
  async function get(path: string, type = "image/png") {
    const entry = zip.file(path);
    if (!entry) throw Error("画像が見つかりません: " + path);
    return readData(
      new Blob([(await entry.async("uint8array")) as Uint8Array<ArrayBuffer>], {
        type,
      }),
    );
  }
  if (p.photo) {
    if (p.photo.data !== "photo.png") throw Error("写真パスが不正です。");
    p.photo.data = await get("photo.png");
  }
  for (let i = 0; i < p.assets.length; i++) {
    if (p.assets[i].data !== `assets/${i}.png`)
      throw Error("素材パスが不正です。");
    p.assets[i].data = await get(`assets/${i}.png`);
    const a = p.assets[i];
    if (a.fbx) {
      if (a.fbx !== `assets/${i}.fbx`) throw Error("FBXパスが不正です。");
      a.fbx = await get(a.fbx, "application/octet-stream");
      for (let t = 0; t < (a.textures || []).length; t++) {
        const texture = a.textures![t];
        if (texture.data !== `assets/${i}-texture-${t}.bin`)
          throw Error("テクスチャパスが不正です。");
        texture.data = await get(texture.data, texture.type);
      }
    }
  }
  return validateProject(p);
}
export async function loadLibrary(file: File): Promise<Asset[]> {
  if (file.size > 100_000_000) throw Error("素材JSONが大きすぎます。");
  const assets = z
    .array(asset)
    .max(200)
    .parse(JSON.parse(await file.text()));
  await validateAssets(assets);
  return assets;
}
