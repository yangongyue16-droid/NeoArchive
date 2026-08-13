import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { resolveAudio, resolveBackground, resolveCharacter } from "../assets/catalog";
import type { PlaybackState, RuntimeAudio } from "../runtime/StoryRuntime";
import { SpineCharacter } from "../SpineCharacter";

const StageTransition = lazy(() =>
  import("./StageTransition").then(({ StageTransition: component }) => ({ default: component })),
);

type StoryStageProps = {
  playback: PlaybackState;
  instantText?: boolean;
  onAdvance?: () => void;
  onChoose?: (optionId: string) => void;
  onDialogueComplete?: () => void;
  onBackgroundTransitionComplete?: (instanceId: number) => void;
  onCharacterEnterComplete?: (instanceId: number) => void;
  onTransitionComplete?: (instanceId: number) => void;
  onTransitionCover?: (instanceId: number) => void;
};

function StoryAudio({ audio }: { audio: RuntimeAudio }) {
  const source = resolveAudio(audio.assetRef);
  return source ? (
    <audio autoPlay key={`${audio.channel}:${audio.assetRef}`} loop={audio.loop} src={source} />
  ) : null;
}

export function StoryStage({
  playback,
  instantText = false,
  onAdvance,
  onChoose,
  onDialogueComplete,
  onBackgroundTransitionComplete,
  onCharacterEnterComplete,
  onTransitionComplete,
  onTransitionCover,
}: StoryStageProps) {
  const backgroundUrl = resolveBackground(playback.backgroundRef);
  const dialogue = playback.dialogue;
  const [visibleCharacters, setVisibleCharacters] = useState(() =>
    instantText ? (dialogue?.text.length ?? 0) : 0,
  );
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
    if (!dialogue || !textComplete || completionNotifiedRef.current === dialogueKey) {
      return;
    }
    completionNotifiedRef.current = dialogueKey;
    onDialogueComplete?.();
  }, [dialogue, dialogueKey, onDialogueComplete, textComplete]);

  return (
    <article
      className={`story-stage ${onAdvance ? "is-interactive" : ""}`}
      onClick={() => {
        if (playback.choices.length > 0) {
          return;
        }
        if (dialogue && !textComplete) {
          setVisibleCharacters(dialogue.text.length);
          return;
        }
        onAdvance?.();
      }}
    >
      {backgroundUrl ? (
        <img
          alt=""
          className="stage-background"
          key={playback.backgroundInstanceId}
          onAnimationEnd={() => onBackgroundTransitionComplete?.(playback.backgroundInstanceId)}
          src={backgroundUrl}
          style={{ animationDuration: `${playback.backgroundTransitionMs}ms` }}
        />
      ) : null}
      <div className="sky-grid" aria-hidden="true" />
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
        audio ? <StoryAudio audio={audio} key={audio.channel} /> : null,
      )}
      {dialogue ? (
        <div className="dialogue-layer">
          <div className="dialogue-content">
            <div className="speaker-line">
              <strong>{dialogue.speaker}</strong>
              {dialogue.subtitle ? <span>{dialogue.subtitle}</span> : null}
            </div>
            <div className="dialogue-rule" />
            <p>{dialogue.text.slice(0, visibleCharacters)}</p>
          </div>
          {textComplete ? <span className="continue-indicator" aria-hidden="true" /> : null}
        </div>
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
