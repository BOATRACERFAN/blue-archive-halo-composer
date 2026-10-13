import {
  Box3,
  Group,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  DoubleSide,
  Color,
  Vector3,
  Material,
  BufferGeometry,
} from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { Asset, Layer } from "./model";
import { assetImage, readData, surface } from "./images";
import { defaultPreset, id } from "./model";

let renderer: WebGLRenderer | undefined;
function webgl() {
  try {
    renderer ??= new WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    throw Error(
      "FBX・前後回転にはWebGL 2が必要です。Chrome / Edgeのグラフィックアクセラレーションを確認してください。",
    );
  }
  return renderer;
}
function dispose(root: Group) {
  const materials = new Set<Material>(),
    geometries = new Set<BufferGeometry>(),
    textures = new Set<Texture>();
  root.traverse((o) => {
    if (o instanceof Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const v of Object.values(m))
          if (v instanceof Texture) textures.add(v);
      }
    }
  });
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
}
const models = new Map<
  string,
  { source: string; textures: string; group: Promise<Group> }
>();
export async function fbxGroup(asset: Asset): Promise<Group> {
  if (!asset.fbx) throw Error("FBXデータがありません。");
  const signature = JSON.stringify(asset.textures || []),
    old = models.get(asset.id);
  if (old?.source === asset.fbx && old.textures === signature) return old.group;
  const promise = (async () => {
    const bytes = Uint8Array.from(atob(asset.fbx!.split(",")[1]), (s) =>
      s.charCodeAt(0),
    );
    const manager = new LoadingManager();
    const blobs = new Set<string>();
    const warnings = new Set<string>();
    const basename = (s: string) => s.split(/[\\/]/).at(-1)!.toLowerCase();
    const textures = new Map(
      (asset.textures || []).map((t) => [basename(t.name), t.data]),
    );
    let started = false;
    let finish!: () => void;
    const loaded = new Promise<void>((r) => (finish = r));
    manager.onStart = () => {
      started = true;
    };
    manager.onLoad = finish;
    manager.onError = (url) =>
      warnings.add("読み込めないテクスチャ: " + basename(url).slice(0, 200));
    manager.setURLModifier((url) => {
      if (/^blob:/.test(url)) {
        blobs.add(url);
        return url;
      }
      if (/^data:image\/(png|jpeg|webp);base64,/i.test(url)) return url;
      const local = textures.get(basename(url));
      if (local) return local;
      warnings.add(
        "不足テクスチャ（単色で表示）: " + basename(url).slice(0, 200),
      );
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";
    });
    await new Promise((r) => setTimeout(r, 0));
    let root: Group;
    try {
      root = new FBXLoader(manager).parse(bytes.buffer, "");
    } catch (e) {
      blobs.forEach((url) => URL.revokeObjectURL(url));
      throw Error(
        "FBXを読み込めません。ASCII 7.0以降 / Binary 6400以降のファイルを確認してください。 " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
    try {
      if (started) {
        await Promise.race([
          loaded,
          new Promise<void>((_, reject) => {
            const timer = setTimeout(
              () =>
                reject(
                  Error("FBXテクスチャの読み込みがタイムアウトしました。"),
                ),
              15000,
            );
            loaded.then(() => clearTimeout(timer));
          }),
        ]);
      }
    } catch (e) {
      dispose(root);
      throw e;
    } finally {
      blobs.forEach((url) => URL.revokeObjectURL(url));
    }
    let vertices = 0,
      meshes = 0;
    root.traverse((o) => {
      if (o instanceof Mesh) {
        meshes++;
        vertices += o.geometry.getAttribute("position")?.count || 0;
        const previous = Array.isArray(o.material) ? o.material : [o.material];
        const converted = previous.map((m) => {
          const v = m as Material & {
            color?: Color;
            map?: Texture;
            opacity: number;
          };
          return new MeshBasicMaterial({
            color: v.color?.clone() || new Color("#a1eeff"),
            map: v.map || null,
            vertexColors: !!o.geometry.getAttribute("color"),
            side: DoubleSide,
            transparent: m.transparent,
            opacity: m.opacity,
            depthWrite: m.depthWrite,
          });
        });
        previous.forEach((m) => m.dispose());
        o.material = Array.isArray(o.material) ? converted : converted[0];
      }
    });
    if (!meshes || vertices > 2_000_000) {
      dispose(root);
      throw Error(
        !meshes
          ? "FBXに表示できるメッシュがありません。"
          : "FBXは頂点数200万以下にしてください。",
      );
    }
    root.updateMatrixWorld(true);
    const initial = new Box3().setFromObject(root);
    const extent = initial.getSize(new Vector3());
    const aligned = new Group();
    aligned.add(root);
    if (extent.y < Math.min(extent.x, extent.z) * 0.2)
      aligned.rotation.x = Math.PI / 2;
    else if (extent.x < Math.min(extent.y, extent.z) * 0.2)
      aligned.rotation.y = Math.PI / 2;
    aligned.updateMatrixWorld(true);
    const box = new Box3().setFromObject(aligned),
      center = box.getCenter(new Vector3()),
      size = box.getSize(new Vector3()),
      radius = size.length() / 2;
    if (!Number.isFinite(radius) || radius <= 0) {
      dispose(aligned);
      throw Error("FBXの形状サイズが不正です。");
    }
    const translated = new Group();
    translated.add(aligned);
    translated.position.copy(center).multiplyScalar(-1);
    const normalized = new Group();
    normalized.add(translated);
    normalized.scale.setScalar(1 / radius);
    const pivot = new Group();
    pivot.add(normalized);
    asset.warnings = [...warnings].slice(0, 99);
    if (warnings.size > 99)
      asset.warnings.push("不足テクスチャ等の警告がほかにもあります。");
    return pivot;
  })();
  if (old) old.group.then(dispose, () => {});
  models.set(asset.id, {
    source: asset.fbx,
    textures: signature,
    group: promise,
  });
  promise.catch(() => {
    if (models.get(asset.id)?.group === promise) models.delete(asset.id);
  });
  if (models.size > 4) {
    const oldest = [...models.entries()].find(([key]) => key !== asset.id)!;
    models.delete(oldest[0]);
    oldest[1].group.then(dispose, () => {});
  }
  return promise;
}
function render(
  group: Group,
  w: number,
  h: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
) {
  const r = webgl();
  const max = Math.min(8192, r.capabilities.maxTextureSize);
  if (w > max || h > max)
    throw Error(
      `3D描画の最大辺はこの端末で${max}pxです。素材のサイズを小さくしてください。`,
    );
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.setClearColor(0, 0);
  const scene = new Scene();
  scene.add(group);
  const camera = new OrthographicCamera(left, right, top, bottom, 0.01, 100);
  camera.position.z = 10;
  camera.lookAt(0, 0, 0);
  r.render(scene, camera);
  scene.remove(group);
  const copy = surface(w, h);
  copy.getContext("2d")!.drawImage(r.domElement, 0, 0);
  return copy;
}
export async function modelImage(
  asset: Asset,
  layer: Pick<Layer, "pitch" | "yaw">,
  quality: number,
) {
  const group = await fbxGroup(asset);
  group.rotation.set(
    ((layer.pitch || 0) * Math.PI) / 180,
    ((layer.yaw || 0) * Math.PI) / 180,
    0,
    "XYZ",
  );
  const side = Math.max(64, Math.min(4096, Math.ceil(quality)));
  return render(group, side, side, -1.05, 1.05, 1.05, -1.05);
}
export async function projectedSource(
  asset: Asset,
  layer: Layer,
  quality: number,
) {
  if (asset.fbx) {
    const canvas = await modelImage(asset, layer, quality);
    return { canvas, w: canvas.width, h: canvas.height, extraX: 0, extraY: 0 };
  }
  const img = await assetImage(asset, quality);
  const k = Math.min(1, quality / img.width),
    w = Math.max(1, Math.ceil(img.width * k)),
    h = Math.max(1, Math.ceil(img.height * k));
  if (!(layer.pitch || layer.yaw)) {
    const canvas = surface(w, h);
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return { canvas, w, h, extraX: 0, extraY: 0 };
  }
  const aspect = h / w,
    radius = Math.hypot(1, aspect);
  const extraX = Math.ceil((Math.max(0, radius - 1) * w) / 2),
    extraY = Math.ceil((Math.max(0, radius - aspect) * w) / 2);
  const texture = new Texture(img);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  const geometry = new PlaneGeometry(2, 2 * aspect),
    material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: DoubleSide,
    }),
    pivot = new Group();
  pivot.add(new Mesh(geometry, material));
  pivot.rotation.set(
    ((layer.pitch || 0) * Math.PI) / 180,
    ((layer.yaw || 0) * Math.PI) / 180,
    0,
    "XYZ",
  );
  try {
    return {
      canvas: render(
        pivot,
        w + 2 * extraX,
        h + 2 * extraY,
        -1 - (2 * extraX) / w,
        1 + (2 * extraX) / w,
        aspect + (2 * extraY) / w,
        -aspect - (2 * extraY) / w,
      ),
      w,
      h,
      extraX,
      extraY,
    };
  } finally {
    texture.dispose();
    geometry.dispose();
    material.dispose();
  }
}
export async function importFbx(
  file: File,
  companions: File[] = [],
): Promise<Asset> {
  if (file.size > 20_000_000) throw Error("FBXは20MB以下にしてください。");
  const textures: NonNullable<Asset["textures"]> = [];
  for (const f of companions) {
    if (f.size > 10_000_000)
      throw Error("テクスチャは1枚10MB以下にしてください。");
    const type = /\.png$/i.test(f.name)
      ? "image/png"
      : /\.jpe?g$/i.test(f.name)
        ? "image/jpeg"
        : "image/webp";
    textures.push({
      name: f.name,
      data: await readData(new Blob([await f.arrayBuffer()], { type })),
      type,
    });
  }
  const asset: Asset = {
    id: id(),
    ja: file.name.replace(/\.fbx$/i, "").slice(0, 100),
    en: "",
    width: 512,
    height: 512,
    data: "",
    fbx: await readData(
      new Blob([await file.arrayBuffer()], {
        type: "application/octet-stream",
      }),
    ),
    textures,
    preset: { ...defaultPreset },
  };
  const canvas = await modelImage(asset, {}, 512);
  asset.data = canvas.toDataURL("image/png");
  return asset;
}
