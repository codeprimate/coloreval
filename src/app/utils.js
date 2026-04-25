/**
 * @param {{ h: number, s: number, v: number }} hsv
 */
export function hsvToRangeValues(hsv) {
  return {
    hue: Math.round(((hsv.h % 360) + 360) % 360),
    sat: Math.round(hsv.s * 100),
    val: Math.round(hsv.v * 100),
  };
}

/**
 * @param {HTMLFormElement} form
 */
export function parseSliders(form) {
  const fd = new FormData(form);
  return {
    h: Number(fd.get("hue")),
    s: Number(fd.get("saturation")) / 100,
    v: Number(fd.get("value")) / 100,
  };
}

/** @param {string} s */
export function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
