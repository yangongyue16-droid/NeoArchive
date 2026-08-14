import { useRef, useState } from "react";
import { importUserAsset, type UserAssetKind } from "../assets/userAssets";

type LocalAssetPickerProps = {
  accept: string;
  allowed: readonly UserAssetKind[];
  buttonLabel: string;
  onImported: (assetRef: string) => void;
};

export function LocalAssetPicker({
  accept,
  allowed,
  buttonLabel,
  onImported,
}: LocalAssetPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="local-asset-picker">
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {busy ? "正在导入…" : buttonLabel}
      </button>
      <input
        accept={accept}
        className="visually-hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) {
            return;
          }
          setBusy(true);
          setError(null);
          void importUserAsset(file, allowed)
            .then((assetRef) => onImported(assetRef))
            .catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : "素材导入失败");
            })
            .finally(() => setBusy(false));
        }}
        ref={inputRef}
        type="file"
      />
      {error ? <p className="local-asset-error">{error}</p> : null}
    </div>
  );
}
