// Readable text on any brand colour: dark ink on light backgrounds, white on dark ones.

const DARK_INK = "#14143d";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})/i.exec((hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export type Ink = {
  /** Text / icon colour to use on top of the colour. */
  fg: string;
  /** True when the background is light (so the text is dark). */
  dark: boolean;
  /** A translucent fill for buttons that sit on the colour. */
  soft: string;
  /** A translucent border for controls that sit on the colour. */
  border: string;
};

/** Which text colour reads best on `bg`. */
export function inkOn(bg: string): Ink {
  const rgb = hexToRgb(bg);
  const light: Ink = { fg: "#fff", dark: false, soft: "rgba(255,255,255,0.2)", border: "rgba(255,255,255,0.35)" };
  if (!rgb) return light;
  const L = luminance(rgb);
  const ink = luminance(hexToRgb(DARK_INK)!);
  if (contrast(L, ink) > contrast(L, 1)) {
    return { fg: DARK_INK, dark: true, soft: "rgba(20,20,61,0.1)", border: "rgba(20,20,61,0.25)" };
  }
  return light;
}

/** The brand colour, darkened just enough to read as text/icon on a white or very light tint. */
export function readableAccent(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const dk = hexToRgb(DARK_INK)!;
  for (let t = 0; t <= 1.001; t += 0.1) {
    const mix = rgb.map((c, i) => Math.round(c + (dk[i] - c) * t)) as [number, number, number];
    if (contrast(luminance(mix), 1) >= 4.5) return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
  }
  return DARK_INK;
}
