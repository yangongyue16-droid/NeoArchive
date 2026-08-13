import { useMemo, useRef, useState } from "react";
import { resolveAudio, type AssetOption } from "../assets/catalog";

type AudioChannel = "bgm" | "voice" | "sfx";
export type AudioLibraryMode = "music" | "sfx";

type AudioLibraryProps = {
  onClose: () => void;
  onUse: (assetRef: string, channel: AudioChannel) => void;
  options: readonly AssetOption[];
  mode?: AudioLibraryMode;
  selectedAssetRef?: string;
};

function sourceLabel(assetRef: string): string {
  return assetRef.startsWith("audio/cc0/") ? "CC0 测试素材" : "本地素材库";
}

function sfxCategory(assetRef: string): "全部" | "UI 交互" | "环境氛围" | "剧情事件" | "通用音效" {
  const name = assetRef.slice("audio/sfx/".length);
  if (name.startsWith("UI_")) return "UI 交互";
  if (name.startsWith("AMB_")) return "环境氛围";
  if (name.startsWith("Main_")) return "剧情事件";
  return "通用音效";
}

export function AudioLibrary({
  mode = "music",
  onClose,
  onUse,
  options,
  selectedAssetRef,
}: AudioLibraryProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<AudioChannel>(mode === "sfx" ? "sfx" : "bgm");
  const [category, setCategory] = useState<ReturnType<typeof sfxCategory>>("全部");
  const [previewAssetRef, setPreviewAssetRef] = useState<string | null>(selectedAssetRef ?? null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const modeOptions = useMemo(
    () =>
      options.filter((option) =>
        mode === "sfx"
          ? option.value.startsWith("audio/sfx/")
          : !option.value.startsWith("audio/sfx/"),
      ),
    [mode, options],
  );
  const visibleOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return modeOptions.filter(
      (option) =>
        (category === "全部" || sfxCategory(option.value) === category) &&
        (!keyword ||
          option.label.toLowerCase().includes(keyword) ||
          option.value.toLowerCase().includes(keyword)),
    );
  }, [category, modeOptions, query]);
  const previewUrl = previewAssetRef ? resolveAudio(previewAssetRef) : null;

  const togglePreview = (assetRef: string) => {
    if (previewAssetRef === assetRef && isPreviewPlaying) {
      audioRef.current?.pause();
      return;
    }
    setPreviewAssetRef(assetRef);
    window.setTimeout(() => {
      void audioRef.current?.play().catch(() => setIsPreviewPlaying(false));
    }, 0);
  };

  return (
    <div
      className="audio-library-overlay"
      role="dialog"
      aria-label={mode === "sfx" ? "音效素材库" : "音乐素材库"}
      aria-modal="true"
    >
      <section className="audio-library-panel">
        <header className="audio-library-header">
          <div>
            <p className="eyebrow">ASSET LIBRARY · {mode === "sfx" ? "SFX" : "MUSIC"}</p>
            <h2>{mode === "sfx" ? "音效素材库" : "音乐素材库"}</h2>
            <span>{modeOptions.length} 个已索引文件 · 点击条目即可试听</span>
          </div>
          <button onClick={onClose} type="button">
            关闭
          </button>
        </header>
        <div className="audio-library-controls">
          <label>
            <span className="visually-hidden">搜索音频</span>
            <input
              autoFocus
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={
                mode === "sfx" ? "搜索音效名称、文件名或引用 ID" : "搜索曲名、文件名或引用 ID"
              }
              type="search"
              value={query}
            />
          </label>
          {mode === "sfx" ? (
            <div className="sfx-category-tabs" role="group" aria-label="音效分类">
              {(["全部", "UI 交互", "环境氛围", "剧情事件", "通用音效"] as const).map((item) => (
                <button
                  className={item === category ? "is-active" : ""}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : (
            <label>
              <span>插入通道</span>
              <select
                onChange={(event) => setChannel(event.currentTarget.value as AudioChannel)}
                value={channel}
              >
                <option value="bgm">BGM</option>
                <option value="voice">语音</option>
              </select>
            </label>
          )}
        </div>
        {previewUrl ? (
          <audio
            key={previewUrl}
            onEnded={() => setIsPreviewPlaying(false)}
            onPause={() => setIsPreviewPlaying(false)}
            onPlay={() => setIsPreviewPlaying(true)}
            preload="metadata"
            ref={audioRef}
            src={previewUrl}
          />
        ) : null}
        <div className="audio-library-list">
          {visibleOptions.map((option) => (
            <article
              className={`audio-library-item ${option.value === previewAssetRef ? "is-previewing" : ""}`}
              key={option.value}
              onClick={() => togglePreview(option.value)}
            >
              <button
                aria-label={`试听 ${option.label}`}
                className="audio-preview-button"
                onClick={(event) => {
                  event.stopPropagation();
                  togglePreview(option.value);
                }}
                type="button"
              >
                {option.value === previewAssetRef && isPreviewPlaying ? "暂停" : "试听"}
              </button>
              <div className="audio-library-copy">
                <strong>{option.label}</strong>
                <code>{option.value}</code>
                <small>{sourceLabel(option.value)}</small>
              </div>
              <button
                className="audio-use-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUse(option.value, channel);
                }}
                type="button"
              >
                {selectedAssetRef ? "替换当前" : "插入剧本"}
              </button>
            </article>
          ))}
          {visibleOptions.length === 0 ? (
            <p className="audio-library-empty">没有匹配的音频素材。</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
