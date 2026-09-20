import { expect, it } from "vite-plus/test";
import { splitMaskAlpha } from "./haloMask";
it("partitions opaque, gray and transparent masks while conserving source alpha", () => {
  const source = new Uint8ClampedArray([30, 40, 50, 255, 30, 40, 50, 128, 30, 40, 50, 200]);
  const mask = new Uint8ClampedArray([255, 255, 255, 255, 128, 128, 128, 255, 255, 255, 255, 0]);
  const { body, halo } = splitMaskAlpha(source, mask, false);
  expect([halo[3], halo[7], halo[11]]).toEqual([255, 64, 0]);
  for (let i = 0; i < source.length; i += 4) {
    expect(body[i + 3] + halo[i + 3]).toBe(source[i + 3]);
    expect(body.slice(i, i + 3)).toEqual(source.slice(i, i + 3));
  }
  const reversed = splitMaskAlpha(source, mask, true);
  expect(reversed.body).toEqual(halo);
  expect(reversed.halo).toEqual(body);
});
it("rejects invalid pixel buffers", () => {
  expect(() => splitMaskAlpha(new Uint8ClampedArray(4), new Uint8ClampedArray(8), false)).toThrow();
});
