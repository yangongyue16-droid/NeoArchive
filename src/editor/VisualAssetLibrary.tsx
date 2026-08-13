import { useMemo, useState } from "react";
import { resolveAssetPreview, type AssetOption } from "../assets/catalog";

type VisualKind = "background" | "character";

type VisualAssetLibraryProps = {
  kind: VisualKind;
  onClose: () => void;
  onUse: (assetRef: string) => void;
  options: readonly AssetOption[];
  selectedAssetRef?: string;
};

const pageSize = 48;

export function VisualAssetLibrary({
  kind,
  onClose,
  onUse,
  options,
  selectedAssetRef,
}: VisualAssetLibraryProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [inspectedAssetRef, setInspectedAssetRef] = useState<string | null>(
    selectedAssetRef ?? null,
  );
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword
      ? options.filter(
          (option) =>
            option.label.toLowerCase().includes(keyword) ||
            option.value.toLowerCase().includes(keyword),
        )
      : options;
  }, [options, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const inspected = options.find((option) => option.value === inspectedAssetRef) ?? null;
  const title = kind === "background" ? "背景素材库" : "角色素材库";

  return (
    <div className="visual-library-overlay" role="dialog" aria-label={title} aria-modal="true">
      <section className="visual-library-panel">
        <header className="visual-library-header">
          <div>
            <p className="eyebrow">ASSET LIBRARY · {kind.toUpperCase()}</p>
            <h2>{title}</h2>
            <span>{options.length} 个已索引素材 · 点击缩略图查看，再一键替换舞台</span>
          </div>
          <button onClick={onClose} type="button">
            关闭
          </button>
        </header>
        <div className="visual-library-controls">
          <input
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(0);
            }}
            placeholder={`搜索${kind === "background" ? "场景" : "角色"}名称或引用 ID`}
            type="search"
            value={query}
          />
          <span>
            {filtered.length} 项 · {currentPage + 1} / {pages} 页
          </span>
          <button
            disabled={currentPage === 0}
            onClick={() => setPage((value) => value - 1)}
            type="button"
          >
            上一页
          </button>
          <button
            disabled={currentPage >= pages - 1}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            下一页
          </button>
        </div>
        <div className="visual-library-content">
          <div className={`visual-asset-grid visual-asset-grid-${kind}`}>
            {visible.map((option) => {
              const preview = resolveAssetPreview(option, kind);
              return (
                <button
                  className={`visual-asset-card ${option.value === inspectedAssetRef ? "is-inspected" : ""}`}
                  key={option.value}
                  onClick={() => setInspectedAssetRef(option.value)}
                  type="button"
                >
                  <span className="visual-asset-image">
                    {preview ? <img alt="" loading="lazy" src={preview} /> : <span>无预览图</span>}
                  </span>
                  <strong>{option.label}</strong>
                  <small>{option.value}</small>
                </button>
              );
            })}
          </div>
          <aside className="visual-asset-inspector">
            {inspected ? (
              <>
                <div className={`visual-asset-large-preview visual-asset-large-preview-${kind}`}>
                  {resolveAssetPreview(inspected, kind) ? (
                    <img
                      alt={inspected.label}
                      src={resolveAssetPreview(inspected, kind) ?? undefined}
                    />
                  ) : (
                    <span>当前角色没有静态预览图，插入后可在舞台查看 Spine 效果。</span>
                  )}
                </div>
                <strong>{inspected.label}</strong>
                <code>{inspected.value}</code>
                <button
                  className="visual-asset-use-button"
                  onClick={() => onUse(inspected.value)}
                  type="button"
                >
                  {selectedAssetRef ? "替换当前素材" : "应用到当前舞台"}
                </button>
              </>
            ) : (
              <p>选择一个素材查看大图与引用信息。</p>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
