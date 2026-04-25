/**
 * Color utilities: HSV (h° 0–360, s/v 0–1) ↔ sRGB (0–1), random targets, match %.
 *
 * **Match score:** Euclidean distance in OKLab (perceptual space) mapped to 0–100
 * with a **Gaussian falloff** `100 · exp(−(d/σ)²)`. The squared exponent is flat
 * near `d = 0`, so perceptually indistinguishable colors score 100 (rewarding
 * near-perfection), then drops steeply through the middle so visibly different
 * colors lose ground quickly, and tapers to ~0 for random pairs.
 */

/**
 * Gaussian width for the OKLab → score mapping. The 50%-score distance is
 * `σ · √ln 2 ≈ 0.83·σ`. Lower σ = stricter (only very close colors score high);
 * higher σ = more generous everywhere.
 */
export const OKLAB_SCORE_SIGMA = 0.15;

/**
 * @param {number} x sRGB channel 0–1
 * @returns {number} linear light 0–1
 */
export function srgbChannelToLinear(x) {
  const c = clamp01(x);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {number} x linear 0–1
 * @returns {number} sRGB 0–1
 */
export function linearChannelToSrgb(x) {
  const c = clamp01(x);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

/**
 * @param {{ r: number, g: number, b: number }} rgb sRGB 0–1
 * @returns {{ r: number, g: number, b: number }} linear RGB 0–1
 */
export function srgbToLinearRgb(rgb) {
  return {
    r: srgbChannelToLinear(rgb.r),
    g: srgbChannelToLinear(rgb.g),
    b: srgbChannelToLinear(rgb.b),
  };
}

/**
 * @param {{ r: number, g: number, b: number }} rgb linear 0–1
 * @returns {{ r: number, g: number, b: number }} sRGB 0–1
 */
export function linearRgbToSrgb(rgb) {
  return {
    r: linearChannelToSrgb(rgb.r),
    g: linearChannelToSrgb(rgb.g),
    b: linearChannelToSrgb(rgb.b),
  };
}

/**
 * @param {{ r: number, g: number, b: number }} rgb sRGB 0–1
 * @returns {{ l: number, a: number, b: number }} OKLab
 */
export function srgbToOklab(rgb) {
  const lin = srgbToLinearRgb(rgb);
  const l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
  const m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
  const s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;

  const l3 = Math.cbrt(Math.max(0, l));
  const m3 = Math.cbrt(Math.max(0, m));
  const s3 = Math.cbrt(Math.max(0, s));

  return {
    l: 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
    a: 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
    b: 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3,
  };
}

/**
 * @param {{ h: number, s: number, v: number }} hsv hue degrees, s/v 0–1
 * @returns {{ r: number, g: number, b: number }} sRGB 0–1
 */
export function hsvToRgb(hsv) {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp01(hsv.s);
  const v = clamp01(hsv.v);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return { r: rp + m, g: gp + m, b: bp + m };
}

/**
 * @param {{ r: number, g: number, b: number }} rgb sRGB 0–1
 * @returns {{ h: number, s: number, v: number }}
 */
export function rgbToHsv(rgb) {
  const r = clamp01(rgb.r);
  const g = clamp01(rgb.g);
  const b = clamp01(rgb.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-10) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

/**
 * Perceptual distance between two sRGB colors, measured in OKLab.
 * @param {{ r: number, g: number, b: number }} rgbA sRGB 0–1
 * @param {{ r: number, g: number, b: number }} rgbB sRGB 0–1
 * @returns {number} Euclidean OKLab distance (≥ 0)
 */
export function oklabDistance(rgbA, rgbB) {
  const oa = srgbToOklab(rgbA);
  const ob = srgbToOklab(rgbB);
  return Math.hypot(oa.l - ob.l, oa.a - ob.a, oa.b - ob.b);
}

/**
 * Maps an OKLab distance to an integer 0–100 score using a Gaussian falloff.
 * Flat near 0 (rewards perfection), steep through the middle, ~0 for random pairs.
 * @param {number} d OKLab distance (≥ 0)
 * @returns {number} integer 0–100
 */
export function scoreFromOklabDistance(d) {
  if (!Number.isFinite(d) || d <= 0) return 100;
  const pct = 100 * Math.exp(-((d / OKLAB_SCORE_SIGMA) ** 2));
  return Math.round(pct);
}

/**
 * @param {{ h: number, s: number, v: number }} a
 * @param {{ h: number, s: number, v: number }} b
 * @returns {number} integer 0–100
 */
export function matchPercentHsv(a, b) {
  return scoreFromOklabDistance(oklabDistance(hsvToRgb(a), hsvToRgb(b)));
}

/** Bounds for random targets — avoids imperceptibly dull swatches. */
export const TARGET_S_MIN = 0.2;
export const TARGET_S_MAX = 1;
export const TARGET_V_MIN = 0.2;
export const TARGET_V_MAX = 1;

/**
 * @param {() => number} [rng] returns 0–1 exclusive of 1 if desired
 * @returns {{ h: number, s: number, v: number }}
 */
export function randomTargetHsv(rng = Math.random) {
  return {
    h: rng() * 360,
    s: TARGET_S_MIN + rng() * (TARGET_S_MAX - TARGET_S_MIN),
    v: TARGET_V_MIN + rng() * (TARGET_V_MAX - TARGET_V_MIN),
  };
}

/**
 * @param {{ r: number, g: number, b: number }} rgb sRGB 0–1
 * @returns {string} CSS `rgb(...)` with 0–255 channels
 */
export function rgbToCssColor(rgb) {
  const r = Math.round(clamp01(rgb.r) * 255);
  const g = Math.round(clamp01(rgb.g) * 255);
  const b = Math.round(clamp01(rgb.b) * 255);
  return `rgb(${r} ${g} ${b})`;
}

export function hsvToCssColor(hsv) {
  return rgbToCssColor(hsvToRgb(hsv));
}
