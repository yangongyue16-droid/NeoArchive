import { useEffect, useRef, useState } from "react";

type PngCharacterProps = {
  enterDurationMs: number;
  imageUrl: string;
  onEnterComplete?: () => void;
  positionXPercent: number;
  positionYPercent: number;
  scalePercent: number;
};

export function isRasterCharacterUrl(url: string): boolean {
  return /\.(?:png|webp|jpe?g|gif)(?:\?|$)/i.test(url);
}

export function PngCharacter({
  enterDurationMs,
  imageUrl,
  onEnterComplete,
  positionXPercent,
  positionYPercent,
  scalePercent,
}: PngCharacterProps) {
  const onEnterCompleteRef = useRef(onEnterComplete);
  const [phase, setPhase] = useState<"hidden" | "enter" | "idle">("hidden");
  const [failed, setFailed] = useState(false);

  onEnterCompleteRef.current = onEnterComplete;

  useEffect(() => {
    setPhase("hidden");
    setFailed(false);
  }, [imageUrl]);

  useEffect(() => {
    if (phase !== "enter") {
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || enterDurationMs <= 0) {
      setPhase("idle");
      onEnterCompleteRef.current?.();
    }
  }, [enterDurationMs, phase]);

  const heightPercent = 94 * (scalePercent / 100);

  return (
    <div className="png-character" aria-hidden="true">
      {failed ? (
        <div className="asset-error" role="alert">
          PNG 立绘加载失败
        </div>
      ) : (
        <img
          alt=""
          className={`png-character-sprite ${phase === "enter" ? "is-entry-ready" : ""} ${
            phase === "idle" ? "is-idle" : ""
          }`}
          draggable={false}
          onAnimationEnd={(event) => {
            if (event.animationName !== "png-character-enter") {
              return;
            }
            setPhase("idle");
            onEnterCompleteRef.current?.();
          }}
          onError={() => {
            setFailed(true);
            onEnterCompleteRef.current?.();
          }}
          onLoad={() => {
            setPhase((current) => (current === "hidden" ? "enter" : current));
          }}
          src={imageUrl}
          style={{
            left: `${positionXPercent}%`,
            top: `${positionYPercent}%`,
            height: `${heightPercent}%`,
            animationDuration: phase === "enter" ? `${enterDurationMs}ms` : undefined,
          }}
        />
      )}
    </div>
  );
}
