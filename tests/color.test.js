import { describe, expect, it } from "vitest";
import {
  hsvToRgb,
  rgbToHsv,
  matchPercentHsv,
  oklabDistance,
  scoreFromOklabDistance,
  randomTargetHsv,
  srgbToLinearRgb,
  linearRgbToSrgb,
  srgbToOklab,
  OKLAB_SCORE_SIGMA,
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

  it("returns 100 for sub-JND perceptual differences", () => {
    const target = { h: 200, s: 0.6, v: 0.7 };
    const nearlyIdentical = { h: 200.05, s: 0.6, v: 0.7 };
    expect(matchPercentHsv(target, nearlyIdentical)).toBe(100);
  });

  it("scores visibly close colors in the high 80s or better", () => {
    const target = { h: 200, s: 0.6, v: 0.7 };
    const close = { h: 198, s: 0.58, v: 0.71 };
    expect(matchPercentHsv(target, close)).toBeGreaterThanOrEqual(85);
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

  it("scores wildly different colors near zero", () => {
    expect(matchPercentHsv({ h: 0, s: 1, v: 1 }, { h: 240, s: 1, v: 1 })).toBeLessThan(5);
  });
});

describe("oklabDistance", () => {
  it("is zero for identical colors", () => {
    const rgb = { r: 0.4, g: 0.7, b: 0.2 };
    expect(oklabDistance(rgb, rgb)).toBe(0);
  });

  it("is symmetric", () => {
    const a = { r: 0.1, g: 0.5, b: 0.9 };
    const b = { r: 0.8, g: 0.3, b: 0.2 };
    expect(oklabDistance(a, b)).toBeCloseTo(oklabDistance(b, a), 12);
  });

  it("grows with perceptual difference", () => {
    const target = { r: 0.5, g: 0.5, b: 0.5 };
    const close = { r: 0.52, g: 0.5, b: 0.5 };
    const far = { r: 1, g: 0, b: 0 };
    expect(oklabDistance(target, close)).toBeLessThan(oklabDistance(target, far));
  });
});

describe("scoreFromOklabDistance", () => {
  it("returns 100 at distance 0", () => {
    expect(scoreFromOklabDistance(0)).toBe(100);
  });

  it("is monotonically non-increasing", () => {
    const points = [0, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1];
    const scores = points.map(scoreFromOklabDistance);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("hits ~50 near σ · √ln 2", () => {
    const halfDistance = OKLAB_SCORE_SIGMA * Math.sqrt(Math.LN2);
    expect(scoreFromOklabDistance(halfDistance)).toBe(50);
  });

  it("treats sub-JND distances (~0.005) as a perfect score", () => {
    expect(scoreFromOklabDistance(0.005)).toBe(100);
  });

  it("rewards visibly close matches generously (~0.05 → ≥ 85)", () => {
    expect(scoreFromOklabDistance(0.05)).toBeGreaterThanOrEqual(85);
  });

  it("punishes very different colors (~0.3 → ≤ 5)", () => {
    expect(scoreFromOklabDistance(0.3)).toBeLessThanOrEqual(5);
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

describe("OKLAB_SCORE_SIGMA", () => {
  it("is the documented Gaussian width", () => {
    expect(OKLAB_SCORE_SIGMA).toBeCloseTo(0.15);
  });
});
