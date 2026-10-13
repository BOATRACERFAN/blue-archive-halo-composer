import { useState, useRef, useEffect } from "react";
import Editor from "./Editor";
import FolderPanel from "./FolderPanel";
import {
  PhotoSequence,
  pickDirectory,
  ensureWriteAccess,
  verifySource,
  saveBeside,
  outputName,
  type Directory,
} from "./folder";
import {
  clone,
  fixedAspect,
  defaultGlow,
  id,
  type Asset,
  type Layer,
  type Project,
} from "./model";
import { importAsset, readPhoto, download } from "./images";
import { exportImage } from "./render";
import { importMaterials } from "./imports";
import catalog from "./catalog.json";
import { saveProject, loadProject, loadLibrary } from "./project";
import { detectFaces } from "./detection";
import { placement, type Face } from "./placement";
import { defaultPreset, type Preset } from "./model";
export default function App() {
  const [project, setProject] = useState<Project>({
    version: 1,
    photo: null,
    assets: [],
    layers: [],
  });
  const [fitSignal, setFitSignal] = useState(0);
  const [folder, setFolder] = useState<PhotoSequence | null>(null),
    [photoIndex, setPhotoIndex] = useState(0);
  const folderRef = useRef<PhotoSequence | null>(null),
    indexRef = useRef(0),
    directoryRef = useRef<Directory | null>(null),
    originalRef = useRef<File | undefined>(undefined),
    operation = useRef(false);
  const [selected, select] = useState<string | null>(null),
    [zoom, setZoom] = useState(0.25),
    [before, setBefore] = useState(false),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(
      "写真を読み込んで、ヘイローを選択してください。",
    ),
    [busy, setBusy] = useState(false);
  const history = useRef<Project[]>([]),
    future = useRef<Project[]>([]);
  const current = useRef(project);
  current.current = project;
  const zipInput = useRef<HTMLInputElement>(null),
    jsonInput = useRef<HTMLInputElement>(null);
  const [exportKind, setExportKind] = useState<"png" | "jpeg" | "halo">("png");
  const photoInput = useRef<HTMLInputElement>(null),
    assetInput = useRef<HTMLInputElement>(null);
  const l = project.layers.find((l) => l.id === selected);
  const chosenAsset = project.assets.find((a) => a.id === l?.assetId);
  function editAsset(patch: Partial<Asset>) {
    if (chosenAsset)
      commit({
        ...project,
        assets: project.assets.map((a) =>
          a.id === chosenAsset.id ? { ...a, ...patch } : a,
        ),
      });
  }
  function order(direction: number) {
    if (!l) return;
    const layers = [...project.layers],
      i = layers.findIndex((x) => x.id === l.id),
      j = i + direction;
    if (j < 0 || j >= layers.length) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    commit({ ...project, layers });
  }
  const [brush, setBrush] = useState<{
    mode: "move" | "hide" | "restore";
    size: number;
    hardness: number;
    show: boolean;
  }>({ mode: "move", size: 80, hardness: 0.7, show: false });
  const [faces, setFaces] = useState<Face[] | null>(null),
    [faceIndex, setFaceIndex] = useState(0),
    [preset, setPreset] = useState<Preset>({ ...defaultPreset }),
    [clickPlace, setClickPlace] = useState(false);
  async function detection() {
    if (!current.current.photo) return [];
    setMessage("顔を検出中…");
    const found = await detectFaces(current.current.photo);
    setFaces(found);
    setFaceIndex(0);
    setMessage(
      found.length
        ? `${found.length}人の顔を検出しました。仮配置を手動で調整してください。`
        : "顔が見つかりません。頭の中心をクリックして配置できます。",
    );
    return found;
  }
  function place(layer: Layer, face: Face, settings: Preset) {
    const asset = current.current.assets.find((a) => a.id === layer.assetId)!;
    edit(layer.id, { ...placement(face, settings, asset), manual: false });
  }
  function placeClick(x: number, y: number) {
    if (!l) return;
    edit(l.id, {
      x: x + project.photo!.width * preset.side * 0.1,
      y: y - project.photo!.height * 0.1 * preset.up,
      manual: true,
    });
    setClickPlace(false);
    setMessage(
      "クリック位置から仮配置しました。数値やドラッグで調整してください。",
    );
  }

  useEffect(() => {
    (async () => {
      const assets: Asset[] = [];
      for (const c of catalog) {
        const body =
          c.shape === "ring"
            ? '<ellipse cx="256" cy="160" rx="208" ry="94"/>'
            : c.shape === "cross"
              ? '<ellipse cx="256" cy="160" rx="180" ry="90"/><path d="M256 12V308M106 160H406"/>'
              : '<ellipse cx="256" cy="160" rx="210" ry="86"/><ellipse cx="256" cy="160" rx="148" ry="54"/><path d="M24 160H80M432 160H488"/>';
        const a = await importAsset(
          new File(
            [
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 320"><g fill="none" stroke="#a1eeff" stroke-width="10">${body}</g></svg>`,
            ],
            c.ja + ".svg",
            { type: "image/svg+xml" },
          ),
        );
        a.en = c.en;
        assets.push(a);
      }
      setProject((p) => (p.assets.length ? p : { ...p, assets }));
    })();
  }, []);
  useEffect(() => {
    const asset = current.current.assets.find(
      (a) =>
        a.id === current.current.layers.find((l) => l.id === selected)?.assetId,
    );
    if (asset) setPreset({ ...asset.preset });
  }, [selected]);
  function commit(next: Project) {
    history.current.push(clone(current.current));
    if (history.current.length > 40) history.current.shift();
    future.current = [];
    current.current = next;
    setProject(next);
  }
  function edit(layerId: string, patch: Partial<Layer>) {
    const layer = current.current.layers.find((l) => l.id === layerId);
    if (layer) patch = fixedAspect(layer, patch);
    commit({
      ...current.current,
      layers: current.current.layers.map((l) =>
        l.id === layerId ? { ...l, ...patch } : l,
      ),
    });
  }
  function undo() {
    const p = history.current.pop();
    if (p) {
      future.current.push(clone(current.current));
      current.current = p;
      setProject(p);
    }
  }
  function redo() {
    const p = future.current.pop();
    if (p) {
      history.current.push(clone(current.current));
      current.current = p;
      setProject(p);
    }
  }
  async function run(fn: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof DOMException && e.name === "AbortError"
          ? "操作をキャンセルしました。編集内容は保持しています。"
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function rememberCurrent() {
    folderRef.current?.remember(
      indexRef.current,
      current.current.layers,
      selected,
    );
  }
  function install(p: Project, chosen: string | null) {
    current.current = p;
    setProject(p);
    history.current = [];
    future.current = [];
    select(chosen);
    setFaces(null);
    setFaceIndex(0);
    setClickPlace(false);
    setBefore(false);
    setBrush((b) => ({ ...b, mode: "move", show: false }));
    setFitSignal((n) => n + 1);
    setZoom(
      p.photo ? Math.min(1, 550 / p.photo.height, 850 / p.photo.width) : 0.25,
    );
  }
  function detachFolder() {
    folderRef.current = null;
    setFolder(null);
    indexRef.current = 0;
    setPhotoIndex(0);
    directoryRef.current = null;
    originalRef.current = undefined;
  }
  async function photo(file: File) {
    await run(async () => {
      const p = await readPhoto(file);
      rememberCurrent();
      detachFolder();
      originalRef.current = file;
      install({ ...current.current, photo: p, layers: [] }, null);
      setMessage(`${p.name} · ${p.width} × ${p.height}px`);
    });
  }
  async function activatePhoto(index: number, session = folderRef.current) {
    if (!session || index < 0 || index >= session.entries.length) return;
    const file = await session.entries[index].handle.getFile(),
      photo = await readPhoto(file);
    rememberCurrent();
    const draft = session.restore(
      index,
      session === folderRef.current
        ? { layers: current.current.layers, selected }
        : undefined,
    );
    folderRef.current = session;
    indexRef.current = index;
    directoryRef.current = session.directory;
    originalRef.current = file;
    setFolder(session);
    setPhotoIndex(index);
    install(
      { ...current.current, photo, layers: draft.layers },
      draft.selected,
    );
    setMessage(
      `${photo.name} · ${photo.width} × ${photo.height}px · ${index + 1}/${session.entries.length}`,
    );
  }
  async function openFolder() {
    await run(async () => {
      const directory = await pickDirectory();
      await ensureWriteAccess(directory);
      const session = await PhotoSequence.open(directory);
      await activatePhoto(0, session);
    });
  }
  async function writeOutput(advance = false) {
    await run(async () => {
      const p = current.current;
      if (!p.photo) return;
      const directory = directoryRef.current || (await pickDirectory());
      await ensureWriteAccess(directory);
      if (!directoryRef.current) {
        await verifySource(directory, p.photo, originalRef.current);
        directoryRef.current = directory;
      }
      const filename = await saveBeside(
        directory,
        p.photo.name,
        exportKind,
        await exportImage(p, exportKind),
      );
      const session = folderRef.current,
        index = indexRef.current;
      session?.saved(index, p.layers, selected);
      if (advance && session && index < session.entries.length - 1) {
        await activatePhoto(index + 1, session);
        setMessage(
          `${filename}を保存しました。次の写真：${current.current.photo!.name}`,
        );
      } else
        setMessage(
          `${directory.name}/${filename} に元解像度で保存しました。${advance ? " フォルダーの最後の写真です。" : ""}`,
        );
    });
  }
  async function downloadOutput() {
    await run(async () => {
      const p = current.current;
      if (!p.photo) return;
      download(
        await exportImage(p, exportKind),
        outputName(p.photo.name, exportKind),
      );
      setMessage(
        "ダウンロードしました。元フォルダーへ直接保存するには「書き出す」を使用してください。",
      );
    });
  }
  async function add(a: Asset) {
    if (!project.photo) {
      setMessage("先に写真を読み込んでください。");
      return;
    }
    const w = project.photo.width * 0.25;
    const layer: Layer = {
      id: id(),
      assetId: a.id,
      name: a.ja,
      x: project.photo.width / 2,
      y: project.photo.height * 0.22,
      width: w,
      height: (w * a.height) / a.width,
      angle: 0,
      pitch: 0,
      yaw: 0,
      skewX: 0,
      skewY: 0,
      opacity: 1,
      visible: true,
      manual: false,
      glow: clone(defaultGlow),
      mask: [],
    };
    commit({ ...project, layers: [...project.layers, layer] });
    select(layer.id);
    setPreset({ ...a.preset });
    await run(async () => {
      const found = faces ?? (await detection());
      if (found.length)
        place(layer, found[Math.min(faceIndex, found.length - 1)], a.preset);
    });
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (operation.current) return;
      if ((e.target as HTMLElement).matches("input,select,textarea")) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      const chosen = current.current.layers.find((x) => x.id === selected);
      if (!chosen) return;
      const d = e.shiftKey ? 10 : 1;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        edit(chosen.id, {
          x:
            chosen.x +
            (e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0),
          y:
            chosen.y +
            (e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0),
          manual: true,
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected]);
  const field = (
    label: string,
    key:
      | "x"
      | "y"
      | "width"
      | "height"
      | "angle"
      | "pitch"
      | "yaw"
      | "skewX"
      | "skewY"
      | "opacity",
    step = 1,
  ) => (
    <label className="field">
      {label}
      <input
        aria-label={label}
        type="number"
        step={step}
        value={l ? Math.round((l[key] || 0) * 100) / 100 : 0}
        disabled={!l || busy}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (l && Number.isFinite(value))
            edit(l.id, {
              [key]:
                key === "width" || key === "height"
                  ? Math.max(1, Math.min(20000, value))
                  : key === "opacity"
                    ? Math.max(0, Math.min(1, value))
                    : key === "pitch" || key === "yaw"
                      ? Math.max(-180, Math.min(180, value))
                      : key.startsWith("skew")
                        ? Math.max(-80, Math.min(80, value))
                        : value,
              manual: true,
            });
        }}
      />
    </label>
  );
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (operation.current) return;
        const f = e.dataTransfer.files[0];
        if (f) void photo(f);
      }}
    >
      <header>
        <div className="brand">
          <span className="logo">◎</span>
          <div>
            <strong>HALO COMPOSER</strong>
            <small>Blue Archive · Local Photo Studio</small>
          </div>
        </div>
        <span className="local">● ローカル処理</span>
        <button onClick={() => photoInput.current?.click()} disabled={busy}>
          写真を開く
        </button>
        <button disabled={busy} onClick={() => void openFolder()}>
          フォルダーを開く
        </button>
        <button disabled={busy} onClick={() => zipInput.current?.click()}>
          ZIPを開く
        </button>
        <button
          disabled={!project.photo || busy}
          onClick={() =>
            void run(async () => {
              download(await saveProject(project), "halo-project.zip");
              setMessage("写真・素材・発光・マスクをZIPに保存しました。");
            })
          }
        >
          プロジェクト保存
        </button>
        <button onClick={undo} disabled={!history.current.length || busy}>
          ↶
        </button>
        <button onClick={redo} disabled={!future.current.length || busy}>
          ↷
        </button>
        <select
          aria-label="出力形式"
          value={exportKind}
          onChange={(e) => setExportKind(e.target.value as typeof exportKind)}
        >
          <option value="png">合成 PNG</option>
          <option value="jpeg">合成 JPEG</option>
          <option value="halo">ヘイローのみ PNG</option>
        </select>
        <button
          className="primary"
          disabled={!project.photo || busy}
          onClick={() => void writeOutput()}
        >
          書き出す ↗
        </button>
        <button
          disabled={!project.photo || busy}
          onClick={() => void downloadOutput()}
        >
          ダウンロード
        </button>
      </header>
      <input
        hidden
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void photo(f);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={assetInput}
        type="file"
        multiple
        accept=".svg,.png,.fbx,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          void run(async () => {
            const assets = await importMaterials(files);
            commit({
              ...current.current,
              assets: [...current.current.assets, ...assets],
            });
            setMessage(
              assets.flatMap((a) => a.warnings || []).join(" / ") ||
                "素材を追加しました。FBXの向きは回転パラメータで調整できます。",
            );
          });
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={zipInput}
        type="file"
        accept=".zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void run(async () => {
              const p = await loadProject(f);
              const matches =
                p.photo?.name === current.current.photo?.name &&
                p.photo?.data === current.current.photo?.data;
              if (!matches) {
                rememberCurrent();
                detachFolder();
              }
              if (matches && folderRef.current)
                p.assets = [
                  ...new Map(
                    [...current.current.assets, ...p.assets].map((a) => [
                      a.id,
                      a,
                    ]),
                  ).values(),
                ];
              install(p, p.layers.at(-1)?.id || null);
              setMessage("プロジェクトを復元しました。");
            });
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={jsonInput}
        type="file"
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void run(async () => {
              const assets = await loadLibrary(f);
              commit({
                ...current.current,
                assets: [
                  ...current.current.assets,
                  ...assets.map((a) => ({ ...a, id: id() })),
                ],
              });
              setMessage("素材ライブラリを読み込みました。");
            });
          e.target.value = "";
        }}
      />
      <main>
        <aside className="left">
          <div className="section-title">
            ヘイロー素材 <span>{project.assets.length}</span>
          </div>
          <input
            className="search"
            placeholder="キャラクター名で検索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="wide"
            onClick={() => assetInput.current?.click()}
            disabled={busy}
          >
            ＋ SVG / PNG / FBXを追加
          </button>
          <div className="row compact">
            <button disabled={busy} onClick={() => jsonInput.current?.click()}>
              素材JSON読込
            </button>
            <button
              disabled={busy}
              onClick={() =>
                download(
                  new Blob([JSON.stringify(project.assets, null, 2)], {
                    type: "application/json",
                  }),
                  "halo-library.json",
                )
              }
            >
              JSON保存
            </button>
          </div>
          <div className="assets">
            {project.assets
              .filter((a) =>
                (a.ja + a.en).toLowerCase().includes(query.toLowerCase()),
              )
              .map((a) => (
                <button
                  className="asset"
                  key={a.id}
                  onClick={() => add(a)}
                  disabled={busy}
                >
                  <img src={a.data} />
                  <strong>{a.ja}</strong>
                  <small>{a.en || "インポート素材"}</small>
                </button>
              ))}
          </div>
          <p className="hint">
            キャラクター素材は、お持ちのSVG・透過PNG・FBXを追加してください。FBXの外部テクスチャは同時に選択できます。
          </p>
          <div className="section-title">
            レイヤー <span>{project.layers.length}</span>
          </div>
          <div className="layers">
            {[...project.layers].reverse().map((x) => (
              <div
                className={"layer " + (x.id === selected ? "active" : "")}
                key={x.id}
              >
                <button onClick={() => select(x.id)}>{x.name}</button>
                <button
                  aria-label={x.name + "の表示"}
                  onClick={() => edit(x.id, { visible: !x.visible })}
                >
                  {x.visible ? "◉" : "○"}
                </button>
              </div>
            ))}
            {project.photo && (
              <div className="layer background">
                ▣ 元写真 <small>ロック</small>
              </div>
            )}
          </div>
        </aside>
        <section className="center">
          {folder && (
            <FolderPanel
              sequence={folder}
              index={photoIndex}
              layers={project.layers}
              busy={busy}
              onNavigate={(i) => void run(() => activatePhoto(i))}
              onSaveNext={() => void writeOutput(true)}
            />
          )}
          {project.photo && !folder && (
            <div className="save-hint">
              書き出しは元名_addhaloで保存します。初回は写真と同じフォルダーを選択してください。
            </div>
          )}
          <div className="toolbar">
            <span>プレビュー</span>
            <button
              onClick={() => {
                setFitSignal((n) => n + 1);
                setZoom(
                  project.photo
                    ? Math.min(
                        1,
                        550 / project.photo.height,
                        850 / project.photo.width,
                      )
                    : 0.25,
                );
              }}
            >
              全体表示
            </button>
            <select
              aria-label="表示倍率"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[...new Set([0.1, 0.25, 0.5, 1, 2, 4, zoom])]
                .sort((a, b) => a - b)
                .map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
            </select>
            <button
              className={before ? "chosen" : ""}
              onClick={() => setBefore(!before)}
            >
              合成前と比較
            </button>
          </div>
          <div
            className="stage"
            style={{ pointerEvents: busy ? "none" : undefined }}
          >
            <Editor
              project={project}
              selected={selected}
              zoom={zoom}
              fitSignal={fitSignal}
              before={before}
              onSelect={select}
              onChange={edit}
              onZoom={setZoom}
              onError={setMessage}
              brush={brush}
              onStroke={(s) => {
                if (l) edit(l.id, { mask: [...l.mask, s] });
              }}
              clickPlace={clickPlace}
              onPlace={placeClick}
            />
            {!project.photo && (
              <div className="empty">
                <span>◎</span>
                <h1>写真に、光の輪を。</h1>
                <p>写真をここにドロップして編集を始める</p>
                <button
                  className="primary"
                  onClick={() => photoInput.current?.click()}
                >
                  写真を選択
                </button>
                <small>JPEG / PNG / WebP · 写真は端末内で処理</small>
              </div>
            )}
          </div>
          <div className="canvas-help">
            ドラッグ：移動　 Alt＋ドラッグ：パン　 ホイール：ズーム　
            矢印：1px移動
          </div>
        </section>
        <aside className="right">
          <div className="section-title">
            変形パラメータ <span>元画像 px</span>
          </div>
          <p className="hint">{l ? l.name : "レイヤーを選択してください"}</p>
          <div className="grid">
            {field("X座標", "x")}
            {field("Y座標", "y")}
            {field("幅", "width")}
            {field("高さ", "height")}
            {field("回転角度", "angle", 0.1)}
            {field("前後回転（X軸）", "pitch", 1)}
            {field("左右回転（Y軸）", "yaw", 1)}
            {field("不透明度", "opacity", 0.05)}
            {field("水平スキュー", "skewX", 0.1)}
            {field("垂直スキュー", "skewY", 0.1)}
          </div>
          <div className="row">
            <button
              disabled={!l || busy}
              onClick={() => {
                if (l) {
                  const c = {
                    ...clone(l),
                    id: id(),
                    x: l.x + 20,
                    y: l.y + 20,
                    name: l.name + " コピー",
                  };
                  commit({ ...project, layers: [...project.layers, c] });
                  select(c.id);
                }
              }}
            >
              複製
            </button>
            <button
              disabled={!l || busy}
              onClick={() => {
                commit({
                  ...project,
                  layers: project.layers.filter((x) => x.id !== selected),
                });
                select(null);
              }}
            >
              削除
            </button>
          </div>
          <div className="row">
            <button disabled={!l || busy} onClick={() => order(1)}>
              前面へ
            </button>
            <button disabled={!l || busy} onClick={() => order(-1)}>
              背面へ
            </button>
          </div>
          {chosenAsset && (
            <details>
              <summary>素材名・プリセット</summary>
              <div className="name-fields">
                <input
                  aria-label="日本語キャラクター名"
                  value={chosenAsset.ja}
                  maxLength={100}
                  onChange={(e) => editAsset({ ja: e.target.value })}
                />
                <input
                  aria-label="英語キャラクター名"
                  value={chosenAsset.en}
                  maxLength={100}
                  placeholder="English name"
                  onChange={(e) => editAsset({ en: e.target.value })}
                />
              </div>
              <button onClick={() => editAsset({ preset: { ...preset } })}>
                現在の自動配置設定を素材に保存
              </button>
              <p className="hint">
                素材JSONやプロジェクトZIPに名前とプリセットを保存します。
              </p>
            </details>
          )}
          <p className="hint">
            拡大縮小の縦横比は固定です。前後回転は手前・奥への傾き、左右回転は横向きの調整です。
          </p>
          {chosenAsset?.warnings?.length ? (
            <p className="warning">{chosenAsset.warnings.join(" / ")}</p>
          ) : null}
          <button
            className="wide"
            disabled={!l || busy}
            onClick={() => l && edit(l.id, { pitch: 0, yaw: 0, manual: true })}
          >
            前後・左右回転をリセット
          </button>
          <details open>
            <summary>顔検出と自動配置</summary>
            <div className="stack">
              <button
                disabled={!project.photo || busy}
                onClick={() =>
                  void run(async () => {
                    await detection();
                  })
                }
              >
                顔を再検出
              </button>
              {faces && faces.length > 0 && (
                <select
                  aria-label="対象の顔"
                  value={faceIndex}
                  onChange={(e) => setFaceIndex(Number(e.target.value))}
                >
                  {faces.map((f, i) => (
                    <option key={i} value={i}>
                      顔 {i + 1} · X {Math.round(f.center.x)} / Y{" "}
                      {Math.round(f.center.y)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid">
              {(["up", "side", "ratio", "angle"] as const).map((key, i) => (
                <label className="field" key={key}>
                  {
                    [
                      "頭上オフセット（顔高比）",
                      "横オフセット（顔幅比）",
                      "顔幅倍率",
                      "基準角度",
                    ][i]
                  }
                  <input
                    aria-label={
                      [
                        "頭上オフセット",
                        "横オフセット",
                        "顔幅倍率",
                        "基準角度",
                      ][i]
                    }
                    type="number"
                    step={key === "angle" ? 1 : 0.05}
                    value={preset[key]}
                    onChange={(e) =>
                      setPreset({
                        ...preset,
                        [key]: Math.max(
                          key === "ratio" ? 0.1 : -10,
                          Math.min(
                            key === "angle" ? 180 : 10,
                            Number(e.target.value),
                          ),
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={preset.rotate}
                onChange={(e) =>
                  setPreset({ ...preset, rotate: e.target.checked })
                }
              />
              顔の傾きを回転へ反映
            </label>
            <button
              className="wide"
              disabled={!l || !faces?.length || busy}
              onClick={() => l && faces && place(l, faces[faceIndex], preset)}
            >
              初期配置を再実行（選択レイヤー）
            </button>
            <button
              className={"wide " + (clickPlace ? "chosen" : "")}
              disabled={!l || busy}
              onClick={() => (
                setBrush({ ...brush, mode: "move" }),
                setClickPlace(!clickPlace)
              )}
            >
              頭の中心をクリックして配置
            </button>
            {l?.manual && (
              <p className="hint">
                手動調整済み。再検出は座標を変更しません。「初期配置を再実行」で再配置します。
              </p>
            )}
            {l &&
              project.photo &&
              (l.x - l.width / 2 < 0 ||
                l.y - l.height / 2 < 0 ||
                l.x + l.width / 2 > project.photo.width ||
                l.y + l.height / 2 > project.photo.height) && (
                <p className="warning">
                  ヘイローが画像外に出る可能性があります。
                </p>
              )}
            <p className="hint">
              ウィッグの体積は推定できません。検出結果は仮配置です。
            </p>
          </details>
          <details open>
            <summary>発光エフェクト</summary>
            <label className="check">
              <input
                aria-label="発光を有効"
                type="checkbox"
                disabled={!l || busy}
                checked={l?.glow.enabled ?? false}
                onChange={(e) =>
                  l &&
                  edit(l.id, { glow: { ...l.glow, enabled: e.target.checked } })
                }
              />
              発光を有効にする
            </label>
            <div className="preset">
              {["標準", "柔らかい光", "強い光"].map((name, i) => (
                <button
                  key={name}
                  disabled={!l || busy}
                  onClick={() =>
                    l &&
                    edit(l.id, {
                      glow: {
                        ...clone(defaultGlow),
                        color: l.glow.color,
                        strength: [1, 0.65, 1.6][i],
                        radius: [1, 1.8, 0.8][i],
                      },
                    })
                  }
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="grid">
              <label className="field">
                発光カラー
                <input
                  aria-label="発光カラー"
                  type="color"
                  value={l?.glow.color || "#71e5ff"}
                  disabled={!l || busy}
                  onChange={(e) =>
                    l &&
                    edit(l.id, { glow: { ...l.glow, color: e.target.value } })
                  }
                />
              </label>
              {(["strength", "radius"] as const).map((k, i) => (
                <label className="field" key={k}>
                  {["発光強度", "発光半径倍率"][i]}
                  <input
                    aria-label={["発光強度", "発光半径倍率"][i]}
                    type="number"
                    min="0"
                    max="4"
                    step=".1"
                    value={l?.glow[k] ?? 1}
                    disabled={!l || busy}
                    onChange={(e) =>
                      l &&
                      edit(l.id, {
                        glow: {
                          ...l.glow,
                          [k]: Math.max(0, Math.min(4, Number(e.target.value))),
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label className="field">
                合成モード
                <select
                  aria-label="合成モード"
                  value={l?.glow.blend || "screen"}
                  disabled={!l || busy}
                  onChange={(e) =>
                    l &&
                    edit(l.id, {
                      glow: {
                        ...l.glow,
                        blend: e.target.value as Layer["glow"]["blend"],
                      },
                    })
                  }
                >
                  <option value="source-over">通常</option>
                  <option value="screen">スクリーン</option>
                  <option value="lighter">加算</option>
                </select>
              </label>
            </div>
            {(["core", "inner", "outer"] as const).map((part, i) => (
              <div key={part}>
                <p className="hint glow-label">
                  {["Core · 本体", "Inner Glow · 内側", "Outer Glow · 外側"][i]}
                </p>
                <div className="triple">
                  {(["brightness", "opacity", "blur"] as const).map((k, j) => (
                    <label className="field" key={k}>
                      {["明るさ", "不透明度", "ぼかし"][j]}
                      <input
                        aria-label={part + " " + k}
                        type="number"
                        step={k === "blur" ? 1 : 0.1}
                        value={l?.glow[part][k] ?? 0}
                        disabled={!l || busy}
                        onChange={(e) =>
                          l &&
                          edit(l.id, {
                            glow: {
                              ...l.glow,
                              [part]: {
                                ...l.glow[part],
                                [k]: Math.max(
                                  0,
                                  Math.min(
                                    k === "blur"
                                      ? 100
                                      : k === "opacity"
                                        ? 1
                                        : 4,
                                    Number(e.target.value),
                                  ),
                                ),
                              },
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p className="hint">ぼかし値は素材幅1000pxを基準に変換します。</p>
          </details>
          <details open>
            <summary>前後関係マスク</summary>
            <div className="preset">
              {(["move", "hide", "restore"] as const).map((m, i) => (
                <button
                  key={m}
                  className={brush.mode === m ? "chosen" : ""}
                  disabled={!l || busy}
                  onClick={() => {
                    setBrush({ ...brush, mode: m });
                    setClickPlace(false);
                  }}
                >
                  {["移動", "非表示ブラシ", "復元ブラシ"][i]}
                </button>
              ))}
            </div>
            <div className="grid">
              <label className="field">
                ブラシサイズ（元画像px）
                <input
                  aria-label="ブラシサイズ"
                  type="number"
                  min="1"
                  max="2000"
                  value={brush.size}
                  onChange={(e) =>
                    setBrush({
                      ...brush,
                      size: Math.max(1, Math.min(2000, Number(e.target.value))),
                    })
                  }
                />
              </label>
              <label className="field">
                硬さ
                <input
                  aria-label="ブラシ硬さ"
                  type="number"
                  min="0"
                  max="1"
                  step=".1"
                  value={brush.hardness}
                  onChange={(e) =>
                    setBrush({
                      ...brush,
                      hardness: Math.max(
                        0,
                        Math.min(1, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={brush.show}
                onChange={(e) => setBrush({ ...brush, show: e.target.checked })}
              />
              マスクを赤で表示
            </label>
            <button
              disabled={!l || !l.mask.length}
              onClick={() => l && edit(l.id, { mask: [] })}
            >
              マスクをリセット
            </button>
            <p className="hint">
              選択レイヤーの本体と発光に適用。1ストロークごとにUndo /
              Redoできます。
            </p>
          </details>
        </aside>
      </main>
      <footer>
        <span role="status">
          {busy ? "処理中… " : ""}
          {message}
        </span>
        <span>
          {project.photo
            ? `${project.photo.width} × ${project.photo.height} px`
            : "READY"}{" "}
          · {Math.round(zoom * 100)}%
        </span>
      </footer>
    </div>
  );
}
