import { describe, expect, it } from "vite-plus/test";
import { voiceBoundaryPatch } from "./voiceSelection";

describe("voice selection boundaries", () => {
  it("keeps precise points without altering the other boundary", () => {
    expect(voiceBoundaryPatch("start", 1234, 5000, 0, 4000)).toEqual({ voiceStartMs: 1234 });
    expect(voiceBoundaryPatch("end", 3456, 5000, 1000)).toEqual({ voiceEndMs: 3456 });
  });

  it("prevents inverted or empty ranges for either boundary", () => {
    expect(voiceBoundaryPatch("start", 4500, 5000, 1000, 4000)).toEqual({
      voiceStartMs: 4500,
      voiceEndMs: 4501,
    });
    expect(voiceBoundaryPatch("end", 500, 5000, 1000)).toEqual({
      voiceStartMs: 499,
      voiceEndMs: 500,
    });
    expect(voiceBoundaryPatch("end", 1000, 5000, 1000)).toEqual({
      voiceStartMs: 999,
      voiceEndMs: 1000,
    });
  });

  it("clamps selections to the audio duration", () => {
    expect(voiceBoundaryPatch("start", 6000, 5000, 0)).toEqual({ voiceStartMs: 4999 });
    expect(voiceBoundaryPatch("end", -20, 5000, 1000)).toEqual({ voiceStartMs: 0, voiceEndMs: 1 });
    expect(voiceBoundaryPatch("end", 6000, 5000, 1000)).toEqual({ voiceEndMs: 5000 });
  });
});
