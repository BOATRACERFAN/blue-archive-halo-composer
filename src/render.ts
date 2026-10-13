import { FabricImage } from "fabric";
import type { Asset, Layer, Project, Stroke } from "./model";
import { assetImage, image, surface, toBlob } from "./images";
export const sourceSizes = new WeakMap<
  FabricImage,
  { w: number; h: number; pad: number }
>();
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  w: number,
  h: number,
  pad: number,
  padY = pad,
) {
  const r = Math.max(0.5, (s.size * w) / 2),
    step = Math.max(0.5, r * 0.18);
  ctx.globalCompositeOperation =
    s.mode === "hide" ? "destination-out" : "source-over";
  const stamp = (x: number, y: number) => {
    x = x * w + pad;
    y = y * h + padY;
    const gradient = ctx.createRadialGradient(
      x,
      y,
      r * Math.min(0.999, s.hardness),
      x,
      y,
      r,
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(
      1,
      s.hardness === 1 ? "rgba(255,255,255,1)" : "rgba(255,255,255,0)",
    );
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let i = 0; i < s.points.length; i++) {
    const a = s.points[i],
      b = s.points[i - 1];
    if (!b) {
      stamp(a.x, a.y);
      continue;
    }
    const count = Math.min(
      10000,
      Math.max(
        1,
        Math.ceil(Math.hypot((a.x - b.x) * w, (a.y - b.y) * h) / step),
      ),
    );
    for (let n = 1; n <= count; n++)
      stamp(b.x + ((a.x - b.x) * n) / count, b.y + ((a.y - b.y) * n) / count);
  }
  ctx.globalCompositeOperation = "source-over";
}
export async function tile(
  asset: Asset,
  layer: Layer,
  quality: number,
  showMask = false,
) {
  let raster: {
    canvas: HTMLCanvasElement;
    w: number;
    h: number;
    extraX: number;
    extraY: number;
  };
  if (asset.fbx || layer.pitch || layer.yaw) {
    const { projectedSource } = await import("./threeAssets");
    raster = await projectedSource(asset, layer, quality);
  } else {
    const img = await assetImage(asset, quality);
    const k = Math.min(1, quality / img.width),
      w = Math.max(1, Math.ceil(img.width * k)),
      h = Math.max(1, Math.ceil(img.height * k));
    const canvas = surface(w, h);
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    raster = { canvas, w, h, extraX: 0, extraY: 0 };
  }
  const { w, h, extraX, extraY } = raster;
  const g = layer.glow,
    unit = w / 1000;
  const pad = g.enabled
    ? Math.ceil(
        Math.max(g.core.blur, g.inner.blur, g.outer.blur) *
          g.radius *
          unit *
          3 +
          2,
      )
    : 0;
  const c = surface(w + (pad + extraX) * 2, h + (pad + extraY) * 2),
    ctx = c.getContext("2d")!;
  const source = surface(c.width, c.height),
    sx = source.getContext("2d")!;
  sx.drawImage(raster.canvas, pad, pad);
  const tint = surface(c.width, c.height),
    tx = tint.getContext("2d")!;
  tx.drawImage(source, 0, 0);
  tx.globalCompositeOperation = "source-in";
  tx.fillStyle = g.color;
  tx.fillRect(0, 0, c.width, c.height);
  if (g.enabled) {
    for (const part of [g.outer, g.inner]) {
      ctx.globalAlpha = Math.min(1, part.opacity * g.strength);
      ctx.filter = `brightness(${part.brightness}) blur(${part.blur * g.radius * unit}px)`;
      ctx.drawImage(tint, 0, 0);
    }
  }
  ctx.globalAlpha = g.core.opacity;
  ctx.filter = `brightness(${g.core.brightness}) blur(${g.enabled ? g.core.blur * g.radius * unit : 0}px)`;
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  if (layer.mask.length) {
    const mask = surface(c.width, c.height),
      mx = mask.getContext("2d")!;
    mx.fillStyle = "#fff";
    mx.fillRect(0, 0, mask.width, mask.height);
    for (const s of layer.mask)
      paintStroke(mx, s, w, h, pad + extraX, pad + extraY);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    if (showMask) {
      const overlay = surface(c.width, c.height),
        ox = overlay.getContext("2d")!;
      ox.fillStyle = "#ff4970";
      ox.fillRect(0, 0, c.width, c.height);
      ox.globalCompositeOperation = "destination-out";
      ox.drawImage(mask, 0, 0);
      ctx.globalAlpha = 0.4;
      ctx.drawImage(overlay, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  return { canvas: c, pad, w, h };
}
export async function objectFor(
  asset: Asset,
  layer: Layer,
  quality: number,
  showMask = false,
) {
  const t = await tile(asset, layer, quality, showMask);
  const obj = new FabricImage(t.canvas, {
    originX: "center",
    originY: "center",
    left: layer.x,
    top: layer.y,
    scaleX: layer.width / t.w,
    scaleY: layer.height / t.h,
    angle: layer.angle,
    skewX: layer.skewX,
    skewY: layer.skewY,
    opacity: layer.opacity,
    visible: layer.visible,
    globalCompositeOperation: layer.glow.enabled
      ? layer.glow.blend
      : "source-over",
    objectCaching: false,
    lockScalingFlip: true,
    minScaleLimit: 0.001,
    cornerColor: "#6edbff",
    borderColor: "#6edbff",
    transparentCorners: false,
    cornerSize: 10,
  });
  obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
  sourceSizes.set(obj, t);
  return obj;
}
export async function exportImage(
  project: Project,
  kind: "png" | "jpeg" | "halo",
) {
  if (!project.photo) throw Error("写真を読み込んでください。");
  const c = surface(project.photo.width, project.photo.height),
    ctx = c.getContext("2d")!;
  if (kind === "jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  if (kind !== "halo") ctx.drawImage(await image(project.photo.data), 0, 0);
  for (const l of project.layers) {
    if (!l.visible) continue;
    const a = project.assets.find((a) => a.id === l.assetId)!;
    const o = await objectFor(a, l, Math.max(l.width, l.height));
    ctx.save();
    ctx.transform(...o.calcTransformMatrix());
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.glow.enabled
      ? l.glow.blend
      : "source-over";
    ctx.drawImage(o.getElement(), -o.width / 2, -o.height / 2);
    ctx.restore();
    await new Promise((r) => setTimeout(r, 0));
  }
  return toBlob(c, kind === "jpeg" ? "image/jpeg" : "image/png");
}
