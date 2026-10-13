import type { Layer, Photo } from "./model";
import { clone, id } from "./model";
import { readPhoto } from "./images";

export type Directory = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  queryPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
};
export type OutputKind = "png" | "jpeg" | "halo";
export type PhotoEntry = { name: string; handle: FileSystemFileHandle };
type Draft = {
  layers: Layer[];
  selected: string | null;
  signature: string;
  saved?: string;
};

export function pickDirectory(): Promise<Directory> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options: {
        id: string;
        mode: "readwrite";
      }) => Promise<Directory>;
    }
  ).showDirectoryPicker;
  if (!picker || !window.isSecureContext)
    throw Error(
      "フォルダーへの保存には、localhostで開いたChrome / Edgeを使用してください。",
    );
  // Invoke directly from the click handler, before decoding or exporting images.
  return picker.call(window, { id: "halo-photos", mode: "readwrite" });
}

export async function ensureWriteAccess(directory: Directory) {
  if (!directory.queryPermission) return;
  if ((await directory.queryPermission({ mode: "readwrite" })) === "granted")
    return;
  if (
    (await directory.requestPermission?.({ mode: "readwrite" })) === "granted"
  )
    return;
  throw Error(
    "フォルダーへの保存が許可されていません。書き込みを許可してから再実行してください。",
  );
}

export class PhotoSequence {
  readonly drafts = new Map<number, Draft>();
  constructor(
    readonly directory: Directory,
    readonly entries: PhotoEntry[],
  ) {}
  static async open(directory: Directory) {
    const entries: PhotoEntry[] = [];
    for await (const [name, handle] of directory.entries()) {
      if (
        handle.kind === "file" &&
        /\.(jpe?g|png|webp)$/i.test(name) &&
        !/_addhalo(?:_\d+)?\.(jpe?g|png|webp)$/i.test(name)
      )
        entries.push({ name, handle: handle as FileSystemFileHandle });
    }
    entries.sort((a, b) =>
      a.name.localeCompare(b.name, "ja", { numeric: true }),
    );
    if (!entries.length)
      throw Error(
        "このフォルダーにJPEG / PNG / WebP写真がありません（_addhalo出力は除外します）。",
      );
    return new PhotoSequence(directory, entries);
  }
  remember(index: number, layers: Layer[], selected: string | null) {
    this.drafts.set(index, {
      layers: clone(layers),
      selected,
      signature: JSON.stringify(layers),
      saved: this.drafts.get(index)?.saved,
    });
  }
  restore(
    index: number,
    previous?: Pick<Draft, "layers" | "selected">,
  ): Pick<Draft, "layers" | "selected"> {
    const draft = this.drafts.get(index);
    if (draft) return { layers: clone(draft.layers), selected: draft.selected };
    let selected: string | null = null;
    const layers = clone(previous?.layers ?? []).map((layer) => {
      const nextId = id();
      if (layer.id === previous?.selected) selected = nextId;
      // Occlusion belongs to the photograph; copied transforms stay in source pixels.
      return { ...layer, id: nextId, mask: [], manual: true };
    });
    return { layers, selected };
  }
  saved(index: number, layers: Layer[], selected: string | null) {
    this.remember(index, layers, selected);
    const draft = this.drafts.get(index)!;
    draft.saved = draft.signature;
  }
  status(index: number, currentLayers?: Layer[]) {
    const draft = this.drafts.get(index),
      layers = currentLayers ?? draft?.layers ?? [];
    if (draft?.saved !== undefined)
      return (currentLayers
        ? JSON.stringify(currentLayers)
        : draft.signature) === draft.saved
        ? "保存済み"
        : "変更あり";
    return layers.length ? "未保存" : "未編集";
  }
}

export function outputName(sourceName: string, kind: OutputKind, sequence = 1) {
  const base =
    sourceName
      .split(/[\\/]/)
      .at(-1)!
      .replace(/\.[^.]*$/, "") || "photo";
  return `${base}_addhalo${sequence > 1 ? "_" + sequence : ""}.${kind === "jpeg" ? "jpg" : "png"}`;
}

export async function verifySource(
  directory: Directory,
  photo: Photo,
  original?: File,
) {
  let file: File;
  try {
    file = await (await directory.getFileHandle(photo.name)).getFile();
  } catch {
    throw Error(
      "読み込み元の写真が見つかりません。写真と同じフォルダーを選択してください。",
    );
  }
  if (original) {
    if (original.size === file.size) {
      const hash = async (f: File) =>
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await f.arrayBuffer()),
        );
      const a = await hash(original),
        b = await hash(file);
      if (a.every((v, i) => v === b[i])) return;
    }
  } else if ((await readPhoto(file)).data === photo.data) return;
  throw Error(
    "同名ですが読み込み元と異なる写真です。元の写真があるフォルダーを選択してください。",
  );
}

export async function saveBeside(
  directory: Directory,
  sourceName: string,
  kind: OutputKind,
  blob: Blob,
) {
  for (let i = 1; i <= 10000; i++) {
    const name = outputName(sourceName, kind, i);
    try {
      await directory.getFileHandle(name);
      continue;
    } catch (e) {
      if (e instanceof DOMException && e.name === "TypeMismatchError") continue;
      if (!(e instanceof DOMException) || e.name !== "NotFoundError") throw e;
    }
    const handle = await directory.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try {
      await stream.write(blob);
      await stream.close();
    } catch (e) {
      await stream.abort().catch(() => {});
      throw e;
    }
    return name;
  }
  throw Error(
    "同名の出力が多すぎます。ファイル名を整理してから保存してください。",
  );
}
