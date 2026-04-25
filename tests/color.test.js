import { describe, expect, it } from "vitest";
import {
  hsvToRgb,
  rgbToHsv,
  matchPercentHsv,
  randomTargetHsv,
  srgbToLinearRgb,
  linearRgbToSrgb,
  srgbToOklab,
  OKLAB_SCORE_DECAY,
  TARGET_S_MIN,
  TARGET_V_MIN,
} from "../src/color.js";

describe("hsvToRgb / rgbToHsv", () => {
  it("round-trips pure red", () => {
    const hsv = { h: 0, s: 1, v: 1 };
    const rgb = hsvToRgb(hsv);
    expect(rgb.r).toBeCloseTo(1, 5);
    expect(rgb.g).toBeCloseTo(0, 5);
    expect(rgb.b).toBeCloseTo(0, 5);
    const back = rgbToHsv(rgb);
    expect(back.h).toBeCloseTo(0, 2);
    expect(back.s).toBeCloseTo(1, 2);
    expect(back.v).toBeCloseTo(1, 2);
  });

  it("round-trips arbitrary color", () => {
    const hsv = { h: 187, s: 0.45, v: 0.82 };
    const back = rgbToHsv(hsvToRgb(hsv));
    expect(back.h).toBeCloseTo(hsv.h, 0);
    expect(back.s).toBeCloseTo(hsv.s, 1);
    expect(back.v).toBeCloseTo(hsv.v, 1);
  });

  it("handles black (s=0)", () => {
    const rgb = hsvToRgb({ h: 123, s: 0, v: 0 });
    expect(rgb.r).toBeCloseTo(0);
    expect(rgb.g).toBeCloseTo(0);
    expect(rgb.b).toBeCloseTo(0);
  });

  it("normalizes negative hue", () => {
    const rgb = hsvToRgb({ h: -30, s: 1, v: 1 });
    const h = rgbToHsv(rgb).h;
    expect(h).toBeCloseTo(330, 0);
  });
});

describe("matchPercentHsv", () => {
  it("returns 100 for identical colors", () => {
    const c = { h: 120, s: 0.5, v: 0.7 };
    expect(matchPercentHsv(c, c)).toBe(100);
  });

  it("increases when user approaches target", () => {
    const target = { h: 200, s: 0.6, v: 0.7 };
    const far = { h: 20, s: 0.2, v: 0.2 };
    const mid = { h: 190, s: 0.55, v: 0.68 };
    const a = matchPercentHsv(target, far);
    const b = matchPercentHsv(target, mid);
    expect(b).toBeGreaterThan(a);
  });

  it("is in 0–100", () => {
    const a = { h: 0, s: 0, v: 0 };
    const b = { h: 300, s: 1, v: 1 };
    const p = matchPercentHsv(a, b);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});

describe("linear rgb helpers", () => {
  it("round-trips sRGB through linear", () => {
    const rgb = { r: 0.5, g: 0.2, b: 0.9 };
    const lin = srgbToLinearRgb(rgb);
    const back = linearRgbToSrgb(lin);
    expect(back.r).toBeCloseTo(rgb.r, 4);
    expect(back.g).toBeCloseTo(rgb.g, 4);
    expect(back.b).toBeCloseTo(rgb.b, 4);
  });
});

describe("srgbToOklab", () => {
  it("maps white near unit lightness", () => {
    const lab = srgbToOklab({ r: 1, g: 1, b: 1 });
    expect(lab.l).toBeCloseTo(1, 3);
  });

  it("maps black near zero lightness", () => {
    const lab = srgbToOklab({ r: 0, g: 0, b: 0 });
    expect(lab.l).toBeCloseTo(0, 5);
  });
});

describe("randomTargetHsv", () => {
  it("respects saturation and value floors", () => {
    const rng = () => 0;
    const t = randomTargetHsv(rng);
    expect(t.s).toBe(TARGET_S_MIN);
    expect(t.v).toBe(TARGET_V_MIN);
  });
});

describe("OKLAB_SCORE_DECAY", () => {
  it("uses a steep decay for low random-match scores", () => {
    expect(OKLAB_SCORE_DECAY).toBeCloseTo(0.1);
  });
});
