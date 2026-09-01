import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { resolveAudio, resolveBackgroundMedia, resolveCharacter } from "../assets/catalog";
import { getUserAssetSnapshot, subscribeUserAssets } from "../assets/userAssets";
import { dialogueBoxCssVars, normalizeDialogueBox, stageCssVars } from "../project-schema/stage";
import type {
  DialogueBoxSettings,
  DialogueRegionStyle,
  StageSettings,
} from "../project-schema/types";
import type { PlaybackState, RuntimeAudio } from "../runtime/StoryRuntime";
import { SpineCharacter } from "../SpineCharacter";

const StageTransition = lazy(() =>
  import("./StageTransition").then(({ StageTransition: component }) => ({ default: component })),
);

type StoryStageProps = {
  playback: PlaybackState;
  stage?: StageSettings;
  dialogueBox?: DialogueBoxSettings;
  instantText?: boolean;
  onAdvance?: () => void;
  onChoose?: (optionId: string) => void;
  onDialogueComplete?: () => void;
  onVoiceEnded?: (cueId?: string) => void;
  onBackgroundVideoEnded?: (instanceId: number) => void;
  onBackgroundTransitionComplete?: (instanceId: number) => void;
  onCharacterEnterComplete?: (instanceId: number) => void;
  onTransitionComplete?: (instanceId: number) => void;
  onTransitionCover?: (instanceId: number) => void;
  hideHud?: boolean;
  layoutEdit?: boolean;
  onDialogueBoxChange?: (
    patch: Partial<DialogueBoxSettings> & {
      speaker?: Partial<DialogueRegionStyle>;
      subtitle?: Partial<DialogueRegionStyle>;
      text?: Partial<DialogueRegionStyle>;
      rule?: Partial<DialogueBoxSettings["rule"]>;
    },
  ) => void;
};

function StoryAudio({
  audio,
  onEnded,
}: {
  audio: RuntimeAudio;
  onEnded?: (cueId?: string) => void;
}) {
  const source = resolveAudio(audio.assetRef);
  return source ? (
    <audio
      autoPlay
      key={`${audio.channel}:${audio.cueId ?? ""}:${audio.assetRef}:${audio.startMs ?? 0}`}
      loop={audio.loop}
      onEnded={() => onEnded?.(audio.cueId)}
      onLoadedMetadata={(event) => {
        if ((audio.startMs ?? 0) > 0) {
          event.currentTarget.currentTime = audio.startMs! / 1000;
        }
      }}
      src={source}
    />
  ) : null;
}

type DialogueRegionKey = "speaker" | "subtitle" | "text" | "rule";

function DialogueLayer({
  dialogueBox,
  layoutEdit,
  onDialogueBoxChange,
  speaker,
  subtitle,
  text,
}: {
  dialogueBox?: DialogueBoxSettings;
  layoutEdit: boolean;
  onDialogueBoxChange?: StoryStageProps["onDialogueBoxChange"];
  speaker: string;
  subtitle: string;
  text: string;
}) {
  const box = normalizeDialogueBox(dialogueBox);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: DialogueRegionKey;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const startDrag = (key: DialogueRegionKey, event: PointerEvent<HTMLElement>) => {
    if (!layoutEdit || !onDialogueBoxChange) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const region = key === "rule" ? box.rule : box[key];
    dragRef.current = {
      key,
      startX: event.clientX,
      startY: event.clientY,
      originX: region.x,
      originY: region.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const layer = layerRef.current;
    if (!drag || !layer || !onDialogueBoxChange) {
      return;
    }
    const rect = layer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const nextX = drag.originX + ((event.clientX - drag.startX) / rect.width) * 100;
    const nextY = drag.originY + ((event.clientY - drag.startY) / rect.height) * 100;
    onDialogueBoxChange({ [drag.key]: { x: nextX, y: nextY } });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className="dialogue-layer" ref={layerRef} style={dialogueBoxCssVars(dialogueBox)}>
      <div className="dialogue-content">
        <strong
          className={layoutEdit ? "is-draggable" : undefined}
          onPointerDown={(event) => startDrag("speaker", event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {speaker}
        </strong>
        <span
          className={layoutEdit ? "is-draggable" : undefined}
          onPointerDown={(event) => startDrag("subtitle", event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {subtitle}
        </span>
        <div
          className={`dialogue-rule ${layoutEdit ? "is-draggable" : ""}`}
          onPointerDown={(event) => startDrag("rule", event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <p
          className={layoutEdit ? "is-draggable" : undefined}
          onPointerDown={(event) => startDrag("text", event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

export function StoryStage({
  playback,
  stage,
  dialogueBox,
  instantText = false,
  onAdvance,
  onChoose,
  onDialogueComplete,
  onVoiceEnded,
  onBackgroundVideoEnded,
  onBackgroundTransitionComplete,
  onCharacterEnterComplete,
  onTransitionComplete,
  onTransitionCover,
  hideHud = false,
  layoutEdit = false,
  onDialogueBoxChange,
}: StoryStageProps) {
  useSyncExternalStore(subscribeUserAssets, getUserAssetSnapshot, () => 0);
  const background = resolveBackgroundMedia(playback.backgroundRef);
  const dialogue = playback.dialogue;
  const [visibleCharacters, setVisibleCharacters] = useState(() =>
    instantText ? (dialogue?.text.length ?? 0) : 0,
  );
  const stageRef = useRef<HTMLElement>(null);
  const [stageScale, setStageScale] = useState(1);
  const completionNotifiedRef = useRef<string | null>(null);
  const dialogueKey = dialogue ? `${dialogue.cueId}:${dialogue.text}` : null;
  const textComplete = !dialogue || instantText || visibleCharacters >= dialogue.text.length;

  useEffect(() => {
    completionNotifiedRef.current = null;
    if (!dialogue) {
      setVisibleCharacters(0);
      return;
    }
    if (instantText) {
      setVisibleCharacters(dialogue.text.length);
      return;
    }
    setVisibleCharacters(0);
    const intervalMs = Math.max(12, Math.round(1000 / dialogue.typingCps));
    const timer = window.setInterval(() => {
      setVisibleCharacters((current) => {
        if (current >= dialogue.text.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [dialogueKey, dialogue, instantText]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }
    const updateScale = () => {
      const width = node.getBoundingClientRect().width;
      const designWidth = stage?.width ?? 1920;
      setStageScale(width > 0 && designWidth > 0 ? width / designWidth : 1);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [stage?.width]);

  useEffect(() => {
    if (!dialogue || !textComplete || completionNotifiedRef.current === dialogueKey) {
      return;
    }
    completionNotifiedRef.current = dialogueKey;
    onDialogueComplete?.();
  }, [dialogue, dialogueKey, onDialogueComplete, textComplete]);

  return (
    <article
      ref={stageRef}
      className={`story-stage ${onAdvance && !layoutEdit ? "is-interactive" : ""} ${layoutEdit ? "is-layout-edit" : ""}`}
      style={
        {
          ...stageCssVars(stage),
          ...dialogueBoxCssVars(dialogueBox),
          "--stage-scale": String(stageScale),
        } as CSSProperties
      }
      onClick={() => {
        if (layoutEdit || playback.choices.length > 0) {
          return;
        }
        if (dialogue && !textComplete) {
          setVisibleCharacters(dialogue.text.length);
          return;
        }
        onAdvance?.();
      }}
    >
      {background?.kind === "video" ? (
        <video
          autoPlay
          className="stage-background"
          key={playback.backgroundInstanceId}
          loop={!playback.backgroundWaitForMediaEnd}
          muted
          onAnimationEnd={() => {
            if (!playback.backgroundWaitForMediaEnd) {
              onBackgroundTransitionComplete?.(playback.backgroundInstanceId);
            }
          }}
          onEnded={() => {
            onBackgroundVideoEnded?.(playback.backgroundInstanceId);
            if (playback.backgroundWaitForMediaEnd) {
              onBackgroundTransitionComplete?.(playback.backgroundInstanceId);
            }
          }}
          playsInline
          src={background.url}
          style={{ animationDuration: `${playback.backgroundTransitionMs}ms` }}
        />
      ) : background ? (
        <img
          alt=""
          className="stage-background"
          key={playback.backgroundInstanceId}
          onAnimationEnd={() => onBackgroundTransitionComplete?.(playback.backgroundInstanceId)}
          src={background.url}
          style={{ animationDuration: `${playback.backgroundTransitionMs}ms` }}
        />
      ) : null}
      {playback.characters.map((character) => {
        const skeletonUrl = resolveCharacter(character.characterRef);
        return skeletonUrl ? (
          <SpineCharacter
            animationName={character.animation}
            enterDurationMs={character.enterDurationMs}
            onEnterComplete={() => onCharacterEnterComplete?.(character.entryInstanceId)}
            key={`${character.characterRef}:${character.entryInstanceId}`}
            positionXPercent={character.transform.x * 100}
            positionYPercent={character.transform.y * 100}
            scalePercent={character.transform.scale * 100}
            skeletonUrl={skeletonUrl}
          />
        ) : null;
      })}
      {Object.values(playback.audio).map((audio) =>
        audio ? (
          <StoryAudio
            audio={audio}
            key={audio.channel}
            onEnded={audio.channel === "voice" ? onVoiceEnded : undefined}
          />
        ) : null,
      )}
      {dialogue && !hideHud ? (
        <DialogueLayer
          dialogueBox={dialogueBox}
          layoutEdit={layoutEdit}
          onDialogueBoxChange={onDialogueBoxChange}
          speaker={dialogue?.speaker ?? "说话人"}
          subtitle={dialogue?.subtitle ?? "身份"}
          text={
            dialogue
              ? dialogue.text.slice(0, visibleCharacters)
              : "在这里预览对话框高度、字号和位置。"
          }
        />
      ) : null}
      {textComplete && dialogue && !layoutEdit && !hideHud ? (
        <span className="continue-indicator" aria-hidden="true" />
      ) : null}
      {playback.choices.length > 0 ? (
        <div className="choice-layer" onClick={(event) => event.stopPropagation()}>
          {playback.choicePrompt ? <p>{playback.choicePrompt}</p> : null}
          <div className="choice-list">
            {playback.choices.map((option) => (
              <button key={option.id} onClick={() => onChoose?.(option.id)} type="button">
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {playback.transition ? (
        <Suspense fallback={null}>
          <StageTransition
            key={playback.transition.instanceId}
            onComplete={onTransitionComplete}
            onCover={onTransitionCover}
            transition={playback.transition}
          />
        </Suspense>
      ) : null}
    </article>
  );
}
