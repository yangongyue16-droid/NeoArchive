import { useMemo, useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import type { TimeWheelConfig } from "../project-schema/types";
import type { RuntimeTransition } from "../runtime/StoryRuntime";

gsap.registerPlugin(useGSAP);

type StageTransitionProps = {
  onComplete?: (instanceId: number) => void;
  onCover?: (instanceId: number) => void;
  transition: RuntimeTransition;
};

const transitionCoverRatio: Record<RuntimeTransition["preset"], number> = {
  "fade-black": 0.45,
  "fade-white": 0.28,
  "archive-shutter": 0.38,
  "halo-iris": 0.48,
  "chromatic-slice": 0.28,
};

const wheelRadius = 136;
const wheelStepDegrees = 13;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

const defaultTimeWheelConfig: TimeWheelConfig = {
  source: "custom",
  precision: "second",
  showDate: true,
  showWeekday: true,
  showTime: true,
  showTimezone: true,
};

function createDateOptions(now: Date, config: TimeWheelConfig): string[] {
  const weekdayFormatter = new Intl.DateTimeFormat("ja-JP", { weekday: "short" });
  return Array.from({ length: 9 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() + index - 4);
    return [
      config.showDate
        ? `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
        : null,
      config.showWeekday ? weekdayFormatter.format(date) : null,
    ]
      .filter(Boolean)
      .join(" ");
  });
}

function createTimeOptions(now: Date, precision: TimeWheelConfig["precision"]): string[] {
  const stepMs = precision === "hour" ? 3_600_000 : precision === "minute" ? 60_000 : 1_000;
  return Array.from({ length: 9 }, (_, index) => {
    const time = new Date(now.getTime() + (index - 4) * stepMs);
    if (precision === "hour") return pad(time.getHours());
    if (precision === "minute") return `${pad(time.getHours())}:${pad(time.getMinutes())}`;
    return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
  });
}

function resolveWheelDate(config: TimeWheelConfig): Date {
  if (config.source === "custom" && config.customDateTime) {
    const parsed = new Date(config.customDateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function layoutWheel(track: HTMLElement, position: number, side: "left" | "right"): void {
  const items = Array.from(track.querySelectorAll<HTMLElement>(".time-wheel-item"));
  items.forEach((item, index) => {
    let offset = index - position;
    offset = ((offset % items.length) + items.length) % items.length;
    if (offset > items.length / 2) {
      offset -= items.length;
    }

    const angle = Math.max(-72, Math.min(72, offset * wheelStepDegrees));
    const radians = (angle * Math.PI) / 180;
    const mirror = side === "left" ? 1 : -1;
    const x = -mirror * wheelRadius * (1 - Math.cos(radians));
    const y = wheelRadius * Math.sin(radians);
    const distance = Math.abs(offset);

    item.style.filter = `blur(${Math.max(0, distance - 1) * 0.7}px)`;
    item.style.opacity = String(Math.max(0.08, 1 - distance * 0.2));
    item.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${(
      mirror * angle
    ).toFixed(2)}deg)`;
    item.classList.toggle("is-wheel-active", distance < 0.5);
  });
}

export function StageTransition({ onComplete, onCover, transition }: StageTransitionProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wheelData = useMemo(() => {
    const config = { ...defaultTimeWheelConfig, ...transition.timeWheel };
    const now = resolveWheelDate(config);
    const showDateWheel = config.showDate || config.showWeekday;
    const showTimeWheel = config.showTime && config.precision !== "day";
    return {
      config,
      dates: showDateWheel ? createDateOptions(now, config) : [],
      times: showTimeWheel ? createTimeOptions(now, config.precision) : [],
      showDateWheel,
      showTimeWheel,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }, [transition.instanceId, transition.timeWheel]);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(root, { autoAlpha: 0 });
        onCover?.(transition.instanceId);
        onComplete?.(transition.instanceId);
        return;
      }

      const duration = Math.max(0.24, transition.durationMs / 1000);
      const hold = Math.max(0, transition.holdMs / 1000);
      const intensity = Math.max(0.1, Math.min(2, transition.intensity));
      const timeline = gsap.timeline({ defaults: { ease: "power3.inOut" } });

      switch (transition.preset) {
        case "fade-black":
          timeline
            .set(root, { autoAlpha: 1 })
            .fromTo(
              ".transition-fill",
              { opacity: 0 },
              { opacity: intensity, duration: duration * 0.45 },
            )
            .to({}, { duration: hold })
            .to(".transition-fill", { opacity: 0, duration: duration * 0.55, ease: "power2.out" })
            .set(root, { autoAlpha: 0 });
          break;
        case "fade-white":
          timeline
            .set(root, { autoAlpha: 1 })
            .fromTo(
              ".transition-fill",
              { opacity: 0 },
              { opacity: Math.min(1, intensity), duration: duration * 0.28, ease: "expo.in" },
            )
            .to({}, { duration: hold })
            .to(".transition-fill", { opacity: 0, duration: duration * 0.72, ease: "power3.out" })
            .set(root, { autoAlpha: 0 });
          break;
        case "archive-shutter":
          timeline
            .set(root, { autoAlpha: 1 })
            .fromTo(
              ".transition-shutter-top",
              { yPercent: -102 },
              { yPercent: 0, duration: duration * 0.38 },
              0,
            )
            .fromTo(
              ".transition-shutter-bottom",
              { yPercent: 102 },
              { yPercent: 0, duration: duration * 0.38 },
              0,
            )
            .fromTo(
              ".transition-scan-line",
              { opacity: 0, scaleX: 0 },
              { opacity: 1, scaleX: 1, duration: duration * 0.24, ease: "power2.out" },
              duration * 0.26,
            )
            .to({}, { duration: hold })
            .to(
              ".transition-shutter-top",
              { yPercent: -102, duration: duration * 0.48, ease: "expo.inOut" },
              ">",
            )
            .to(
              ".transition-shutter-bottom",
              { yPercent: 102, duration: duration * 0.48, ease: "expo.inOut" },
              "<",
            )
            .to(".transition-scan-line", { opacity: 0, duration: duration * 0.15 }, "<")
            .set(root, { autoAlpha: 0 });
          break;
        case "halo-iris":
          timeline
            .set(root, { autoAlpha: 1 })
            .fromTo(
              ".transition-halo-disc",
              { clipPath: "circle(0% at 50% 50%)", opacity: 0.94 },
              {
                clipPath: "circle(78% at 50% 50%)",
                duration: duration * 0.48,
                ease: "expo.inOut",
              },
            )
            .fromTo(
              ".transition-halo-ring",
              { opacity: 0, scale: 0.18, rotate: -24 },
              { opacity: intensity, scale: 1, rotate: 0, duration: duration * 0.35 },
              0,
            )
            .to({}, { duration: hold })
            .to(
              ".transition-halo-ring",
              { opacity: 0, scale: 1.28, duration: duration * 0.34, ease: "power2.out" },
              ">",
            )
            .to(
              ".transition-halo-disc",
              { opacity: 0, duration: duration * 0.52, ease: "power3.out" },
              "<",
            )
            .set(root, { autoAlpha: 0 });
          break;
        case "chromatic-slice": {
          const wheelDuration = duration;
          const dateTrack = root.querySelector<HTMLElement>(".time-wheel-date .time-wheel-track");
          const clockTrack = root.querySelector<HTMLElement>(".time-wheel-clock .time-wheel-track");
          if (!dateTrack && !clockTrack) {
            break;
          }

          const steps = 9 * Math.max(2, Math.round(intensity * 2));
          const dateWheel = { position: 4 - steps };
          const clockWheel = { position: 4 + steps };
          if (dateTrack) layoutWheel(dateTrack, dateWheel.position, "left");
          if (clockTrack) layoutWheel(clockTrack, clockWheel.position, "right");

          timeline
            .set(root, { autoAlpha: 1 })
            .fromTo(
              ".transition-time-wheel",
              { clipPath: "inset(49% 0 49% 0)", opacity: 0.7 },
              {
                clipPath: "inset(0% 0 0% 0)",
                opacity: 1,
                duration: wheelDuration * 0.28,
                ease: "expo.inOut",
              },
            )
            .to(
              dateWheel,
              {
                position: 4,
                duration: wheelDuration * 0.58,
                ease: "power4.out",
                onUpdate: () => dateTrack && layoutWheel(dateTrack, dateWheel.position, "left"),
              },
              wheelDuration * 0.08,
            )
            .to(
              clockWheel,
              {
                position: 4,
                duration: wheelDuration * 0.58,
                ease: "power4.out",
                onUpdate: () => clockTrack && layoutWheel(clockTrack, clockWheel.position, "right"),
              },
              "<",
            )
            .fromTo(
              ".time-wheel-focus-line",
              { scaleX: 0 },
              { scaleX: 1, duration: wheelDuration * 0.26, ease: "power3.out" },
              wheelDuration * 0.2,
            )
            .fromTo(
              ".time-wheel-caption",
              { autoAlpha: 0, y: 8 },
              { autoAlpha: 1, y: 0, duration: wheelDuration * 0.16 },
              "<",
            )
            .addLabel("wheelClose", wheelDuration * 0.66 + hold)
            .to(
              ".time-wheel-caption",
              { autoAlpha: 0, y: -8, duration: wheelDuration * 0.12, ease: "power2.in" },
              "wheelClose",
            )
            .to(
              ".time-wheel-item",
              { autoAlpha: 0, duration: wheelDuration * 0.24, ease: "power2.in" },
              "wheelClose",
            )
            .to(
              ".time-wheel-focus-line",
              { scaleX: 0, duration: wheelDuration * 0.24, ease: "power3.in" },
              "wheelClose",
            )
            .to(
              ".time-wheel-center-mark",
              { autoAlpha: 0, scale: 0.5, duration: wheelDuration * 0.18, ease: "power2.in" },
              "wheelClose",
            )
            .to(
              root,
              {
                scaleY: 0,
                transformOrigin: "50% 50%",
                duration: wheelDuration * 0.34,
                ease: "expo.inOut",
              },
              "wheelClose",
            )
            .set(root, { autoAlpha: 0 });
          break;
        }
      }

      timeline.call(
        () => onCover?.(transition.instanceId),
        [],
        duration * transitionCoverRatio[transition.preset],
      );
      timeline.eventCallback("onComplete", () => onComplete?.(transition.instanceId));
    },
    { scope: rootRef, dependencies: [onComplete, onCover, transition.instanceId] },
  );

  return (
    <div
      aria-hidden="true"
      className={`stage-transition transition-${transition.preset}`}
      ref={rootRef}
    >
      <div className="transition-fill" />
      <div className="transition-shutter transition-shutter-top">
        <span>NEO / ARCHIVE</span>
      </div>
      <div className="transition-shutter transition-shutter-bottom">
        <span>STORY RECORD</span>
      </div>
      <div className="transition-scan-line" />
      <div className="transition-halo-disc" />
      <div className="transition-halo-ring" />
      <div className="transition-time-wheel">
        {wheelData.showDateWheel ? (
          <div className="time-wheel-column time-wheel-date">
            <span className="time-wheel-caption">STORY DATE</span>
            <div className="time-wheel-track">
              {wheelData.dates.map((label) => (
                <span className="time-wheel-item" key={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {wheelData.showTimeWheel ? (
          <div className="time-wheel-column time-wheel-clock">
            <span className="time-wheel-caption">
              STORY TIME
              {wheelData.config.showTimezone ? ` · ${wheelData.timezone}` : ""}
            </span>
            <div className="time-wheel-track">
              {wheelData.times.map((label) => (
                <span className="time-wheel-item" key={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <span className="time-wheel-focus-line" />
        <span className="time-wheel-center-mark" />
      </div>
    </div>
  );
}
