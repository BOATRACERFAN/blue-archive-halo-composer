import { importAsset } from "./images";
import type { Asset } from "./model";
export async function importMaterials(files: File[]): Promise<Asset[]> {
  const fbx = files.filter((f) => /\.fbx$/i.test(f.name));
  if (fbx.length) {
    const textures = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
    if (textures.length > 32)
      throw Error("FBXのテクスチャは32枚以下にしてください。");
    const { importFbx } = await import("./threeAssets");
    const results: Asset[] = [];
    for (const file of fbx) results.push(await importFbx(file, textures));
    for (const f of files.filter((f) => /\.svg$/i.test(f.name)))
      results.push(await importAsset(f));
    return results;
  }
  return Promise.all(files.map(importAsset));
}
