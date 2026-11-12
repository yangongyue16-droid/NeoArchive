// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { sampleProject } from "../project-schema/sampleProject";
import { StoryRuntime, type PlaybackState, type RuntimeAudio } from "../runtime/StoryRuntime";
import { StoryStage } from "./StoryStage";

vi.mock("../SpineCharacter", () => ({ SpineCharacter: () => null }));

function playbackWith(audio: RuntimeAudio): PlaybackState {
  return { ...new StoryRuntime(sampleProject).getSnapshot(), audio: { [audio.channel]: audio } };
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("story audio playback", () => {
  it("offers a user gesture retry when browser autoplay is blocked", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    play.mockRejectedValueOnce(new DOMException("Gesture required", "NotAllowedError"));
    const audio: RuntimeAudio = { assetRef: "/music.wav", channel: "bgm", loop: true, volume: 0.2 };
    const { findByRole, queryByRole } = render(<StoryStage playback={playbackWith(audio)} />);
    fireEvent.click(await findByRole("button", { name: "点击启用背景音乐" }));
    await waitFor(() => expect(queryByRole("button", { name: "点击启用背景音乐" })).toBeNull());
    expect(play).toHaveBeenCalledTimes(2);
  });
  it("applies cue volume to the actual audio element", () => {
    const audio: RuntimeAudio = { assetRef: "/music.wav", channel: "bgm", loop: true, volume: 0.2 };
    const { container } = render(<StoryStage playback={playbackWith(audio)} />);
    expect(container.querySelector("audio")?.volume).toBe(0.2);
    expect(container.querySelector("audio")?.loop).toBe(true);
  });

  it("updates volume without replacing or rewinding the track", () => {
    const audio: RuntimeAudio = { assetRef: "/music.wav", channel: "bgm", loop: true, volume: 0.2 };
    const { container, rerender } = render(<StoryStage playback={playbackWith(audio)} />);
    const element = container.querySelector("audio")!;
    element.currentTime = 0.75;
    rerender(<StoryStage playback={playbackWith({ ...audio, volume: 0.6 })} />);
    expect(container.querySelector("audio")).toBe(element);
    expect(element.volume).toBe(0.6);
    expect(element.currentTime).toBe(0.75);
  });

  it("supports silent cues and clamps invalid imported volume values", () => {
    const audio: RuntimeAudio = { assetRef: "/music.wav", channel: "sfx", loop: false, volume: 0 };
    const { container, rerender } = render(<StoryStage playback={playbackWith(audio)} />);
    expect(container.querySelector("audio")?.volume).toBe(0);
    rerender(<StoryStage playback={playbackWith({ ...audio, volume: 5 })} />);
    expect(container.querySelector("audio")?.volume).toBe(1);
    rerender(<StoryStage playback={playbackWith({ ...audio, volume: -1 })} />);
    expect(container.querySelector("audio")?.volume).toBe(0);
  });

  it("seeks to the voice start and reports its trimmed end only once", () => {
    const audio: RuntimeAudio = {
      assetRef: "/voice.wav",
      channel: "voice",
      loop: false,
      volume: 1,
      startMs: 500,
      endMs: 1500,
      cueId: "line",
    };
    const onVoiceEnded = vi.fn();
    const { container } = render(
      <StoryStage playback={playbackWith(audio)} onVoiceEnded={onVoiceEnded} />,
    );
    const element = container.querySelector("audio")!;
    fireEvent.loadedMetadata(element);
    expect(element.currentTime).toBe(0.5);
    element.currentTime = 1.5;
    fireEvent.timeUpdate(element);
    fireEvent.timeUpdate(element);
    fireEvent.ended(element);
    expect(onVoiceEnded).toHaveBeenCalledExactlyOnceWith("line");
  });
});
