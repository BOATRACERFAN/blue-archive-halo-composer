import type { Preset, Asset } from "./model";
export type Landmark = { x: number; y: number; z?: number };
export type Face = {
  center: { x: number; y: number };
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  forehead: { x: number; y: number };
  width: number;
  height: number;
  roll: number;
};
export function summarizeFace(points: Landmark[], w: number, h: number): Face {
  const p = (i: number) => ({ x: points[i].x * w, y: points[i].y * h });
  const mean = (ids: number[]) => {
    const a = ids.map(p);
    return {
      x: a.reduce((s, p) => s + p.x, 0) / a.length,
      y: a.reduce((s, p) => s + p.y, 0) / a.length,
    };
  };
  let leftEye = mean([33, 133, 159, 145]),
    rightEye = mean([362, 263, 386, 374]);
  if (leftEye.x > rightEye.x) [leftEye, rightEye] = [rightEye, leftEye];
  const forehead = p(10),
    chin = p(152),
    a = p(234),
    b = p(454);
  return {
    center: { x: (forehead.x + chin.x) / 2, y: (forehead.y + chin.y) / 2 },
    leftEye,
    rightEye,
    forehead,
    width: Math.hypot(a.x - b.x, a.y - b.y),
    height: Math.hypot(forehead.x - chin.x, forehead.y - chin.y),
    roll:
      (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) /
      Math.PI,
  };
}
export function placement(
  face: Face,
  preset: Preset,
  asset: Pick<Asset, "width" | "height">,
) {
  const r = (face.roll * Math.PI) / 180,
    up = face.height * preset.up,
    side = face.width * preset.side,
    width = face.width * preset.ratio;
  return {
    x: face.forehead.x + Math.sin(r) * up + Math.cos(r) * side,
    y: face.forehead.y - Math.cos(r) * up + Math.sin(r) * side,
    width,
    height: (width * asset.height) / asset.width,
    angle: preset.angle + (preset.rotate ? face.roll : 0),
  };
}
