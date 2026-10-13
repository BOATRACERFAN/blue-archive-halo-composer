import type { Layer } from "./model";
import type { PhotoSequence } from "./folder";

export default function FolderPanel(p: {
  sequence: PhotoSequence;
  index: number;
  layers: Layer[];
  busy: boolean;
  onNavigate: (index: number) => void;
  onSaveNext: () => void;
}) {
  const status = p.sequence.status(p.index, p.layers);
  return (
    <div className="folder-panel">
      <div className="folder-heading">
        <strong>📁 {p.sequence.directory.name}</strong>
        <span>
          {p.index + 1} / {p.sequence.entries.length} · {status}
        </span>
      </div>
      <div className="folder-navigation">
        <button
          disabled={p.busy || p.index === 0}
          onClick={() => p.onNavigate(p.index - 1)}
        >
          前の写真
        </button>
        <select
          aria-label="フォルダー内の写真"
          value={p.index}
          disabled={p.busy}
          onChange={(e) => p.onNavigate(Number(e.target.value))}
        >
          {p.sequence.entries.map((entry, i) => (
            <option value={i} key={entry.name}>
              {i + 1}. {entry.name} ·{" "}
              {i === p.index ? status : p.sequence.status(i)}
            </option>
          ))}
        </select>
        <button
          disabled={p.busy || p.index === p.sequence.entries.length - 1}
          onClick={() => p.onNavigate(p.index + 1)}
        >
          次の写真
        </button>
        <button className="primary" disabled={p.busy} onClick={p.onSaveNext}>
          {p.index === p.sequence.entries.length - 1
            ? "保存して完了"
            : "保存して次へ"}
        </button>
      </div>
      <small>
        保存先：このフォルダー /
        元名_addhalo　·　編集状態は画面を開いている間保持
      </small>
      <small>
        未編集の写真へは素材・発光・変形を引き継ぎます（マスクは写真ごと）。
      </small>
    </div>
  );
}
