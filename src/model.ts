export type GlowPart = { brightness: number; opacity: number; blur: number };
export type Glow = {
  enabled: boolean;
  color: string;
  strength: number;
  radius: number;
  blend: "source-over" | "screen" | "lighter";
  core: GlowPart;
  inner: GlowPart;
  outer: GlowPart;
};
export type Stroke = {
  mode: "hide" | "restore";
  size: number;
  hardness: number;
  points: { x: number; y: number }[];
};
export type Preset = {
  up: number;
  side: number;
  ratio: number;
  angle: number;
  rotate: boolean;
};
export type Asset = {
  id: string;
  ja: string;
  en: string;
  data: string;
  svg?: string;
  fbx?: string;
  textures?: {
    name: string;
    data: string;
    type: "image/png" | "image/jpeg" | "image/webp";
  }[];
  warnings?: string[];
  width: number;
  height: number;
  crop?: { x: number; y: number; w: number; h: number };
  preset: Preset;
};
export type Layer = {
  id: string;
  assetId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  pitch?: number;
  yaw?: number;
  skewX: number;
  skewY: number;
  opacity: number;
  visible: boolean;
  manual: boolean;
  glow: Glow;
  mask: Stroke[];
};
export type Photo = {
  name: string;
  data: string;
  width: number;
  height: number;
};
export type Project = {
  version: 1;
  photo: Photo | null;
  assets: Asset[];
  layers: Layer[];
};
export const defaultPreset: Preset = {
  up: 0.38,
  side: 0,
  ratio: 1.55,
  angle: 0,
  rotate: true,
};
export const defaultGlow: Glow = {
  enabled: true,
  color: "#71e5ff",
  strength: 1,
  radius: 1,
  blend: "screen",
  core: { brightness: 1, opacity: 1, blur: 0 },
  inner: { brightness: 1.4, opacity: 0.8, blur: 8 },
  outer: { brightness: 1.2, opacity: 0.55, blur: 30 },
};
export const id = () => crypto.randomUUID();
export const clone = <T>(x: T): T => structuredClone(x);
// Lock the current ratio, including projects created before ratio locking.
export function fixedAspect(
  layer: Layer,
  patch: Partial<Layer>,
): Partial<Layer> {
  const ratio = layer.height / layer.width;
  if (patch.width !== undefined) {
    const width = Math.max(
      1,
      1 / ratio,
      Math.min(20000, 20000 / ratio, patch.width),
    );
    return { ...patch, width, height: width * ratio };
  }
  if (patch.height !== undefined) {
    const height = Math.max(
      1,
      ratio,
      Math.min(20000, 20000 * ratio, patch.height),
    );
    return { ...patch, height, width: height / ratio };
  }
  return patch;
}
