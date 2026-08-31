import { C } from './palette';
import { ellipse, mix, Rect } from './px';

export type Bloom = 'pink' | 'blush' | 'white' | 'cream';

/** mid, shadow, highlight for each bloom tone. */
const TONES: Record<Bloom, [number, number, number]> = {
  pink: [C.petal, C.petalDark, C.petalLight],
  blush: [C.petalLight, C.petal, 0xffe8f1],
  white: [0xfdeef4, C.petalLight, 0xffffff],
  cream: [0xffe9c9, 0xe9c48f, 0xfff8e6],
};

/**
 * Blooms are built out of ellipses rather than hand-typed masks: five
 * petals around a pollen core, each petal a shadow disc, a mid disc and a
 * highlight, with a darker rim behind the lot to hold the silhouette.
 * On a fine grid that reads as a real flower instead of a pink blob.
 */
export function flower(
  x: number,
  y: number,
  r = 12,
  tone: Bloom = 'pink',
  rot = 0,
): Rect[] {
  const [mid, dark, light] = TONES[tone];
  const rim = mix(dark, C.plumDeep, 0.75);
  const out: Rect[] = [];
  const petalR = r * 0.52;
  const ring = r * 0.5;
  const petals = 5;

  // silhouette
  for (let i = 0; i < petals; i++) {
    const a = rot + (i / petals) * Math.PI * 2;
    out.push(
      ...ellipse(
        x + Math.cos(a) * ring,
        y + Math.sin(a) * ring,
        petalR + 1,
        petalR + 1,
        rim,
        0.55,
      ),
    );
  }
  // shadow side, then the petal, then the light side
  for (let i = 0; i < petals; i++) {
    const a = rot + (i / petals) * Math.PI * 2;
    const px = x + Math.cos(a) * ring;
    const py = y + Math.sin(a) * ring;
    out.push(...ellipse(px + petalR * 0.18, py + petalR * 0.26, petalR, petalR, dark));
    out.push(...ellipse(px, py, petalR * 0.94, petalR * 0.94, mid));
    out.push(
      ...ellipse(px - petalR * 0.22, py - petalR * 0.28, petalR * 0.52, petalR * 0.46, light),
    );
    // crease running back to the core
    out.push([
      Math.round(px - Math.cos(a) * petalR * 0.2),
      Math.round(py - Math.sin(a) * petalR * 0.2),
      Math.max(1, Math.round(r * 0.09)),
      Math.max(1, Math.round(r * 0.09)),
      dark,
      0.5,
    ]);
  }
  // pollen core
  out.push(...ellipse(x, y, r * 0.34, r * 0.34, C.goldDark));
  out.push(...ellipse(x, y, r * 0.27, r * 0.27, C.bloomCore));
  out.push(...ellipse(x - r * 0.08, y - r * 0.1, r * 0.13, r * 0.12, C.cream));
  const dot = Math.max(1, Math.round(r * 0.1));
  for (let i = 0; i < 5; i++) {
    const a = rot * 1.7 + (i / 5) * Math.PI * 2;
    out.push([
      Math.round(x + Math.cos(a) * r * 0.2),
      Math.round(y + Math.sin(a) * r * 0.2),
      dot,
      dot,
      C.goldDark,
    ]);
  }
  return out;
}

/** A closed bud — filler that keeps the garland from looking uniform. */
export function bud(x: number, y: number, r = 7, tone: Bloom = 'pink'): Rect[] {
  const [mid, dark, light] = TONES[tone];
  return [
    ...ellipse(x, y, r * 0.8, r, mix(dark, C.plumDeep, 0.8), 0.5),
    ...ellipse(x, y, r * 0.72, r * 0.92, dark),
    ...ellipse(x - r * 0.12, y - r * 0.1, r * 0.55, r * 0.78, mid),
    ...ellipse(x - r * 0.28, y - r * 0.3, r * 0.22, r * 0.4, light),
    // sepals
    ...ellipse(x - r * 0.5, y + r * 0.75, r * 0.4, r * 0.3, C.leafDark),
    ...ellipse(x + r * 0.5, y + r * 0.75, r * 0.4, r * 0.3, C.leaf),
    [Math.round(x - 1), Math.round(y + r * 0.9), 2, Math.round(r * 0.7), C.leafDark],
  ];
}

/**
 * A pointed leaf with a midrib, angled by `a` (radians). Each step along
 * the leaf draws its cross-section as ONE run rather than pixel by pixel —
 * same picture, a tenth of the draw calls, which matters when the arch is
 * carrying a hundred and fifty of these.
 */
export function leaf(x: number, y: number, len = 26, a = 0, dark = false): Rect[] {
  const out: Rect[] = [];
  const base = dark ? C.leafDark : C.leaf;
  const edge = mix(base, C.plumDeep, 0.72);
  const lit = mix(base, C.cream, 0.62);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const flat = Math.abs(dx) >= Math.abs(dy);
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    // widest a third of the way along, tapering to a point
    const w = Math.max(0, Math.round(Math.sin(Math.pow(t, 0.7) * Math.PI) * len * 0.26));
    const cx = Math.round(x + dx * i);
    const cy = Math.round(y + dy * i);
    const span = w * 2 + 1;
    if (flat) {
      out.push([cx, cy - w, 1, span, base]);
      out.push([cx, cy - w, 1, 1, edge]);
      out.push([cx, cy + w, 1, 1, edge]);
    } else {
      out.push([cx - w, cy, span, 1, base]);
      out.push([cx - w, cy, 1, 1, edge]);
      out.push([cx + w, cy, 1, 1, edge]);
    }
    if (w > 0) out.push([cx, cy, 1, 1, lit]);
  }
  return out;
}

/** Vine hanging from the top edge, with a bloom on the end. */
export function vine(x: number, length: number, seed: number): Rect[] {
  const out: Rect[] = [];
  let cx = x;
  let cy = 0;
  for (let i = 0; i < length; i++) {
    cx = x + Math.round(Math.sin((i + seed * 120) / 56) * 16);
    cy = i;
    out.push([cx, cy, 3, 1, C.leafDark]);
    out.push([cx, cy, 1, 1, C.leaf]);
    if (i % 34 === 0) out.push(...leaf(cx + 3, cy, 20, 0.5 + seed * 0.3));
    if (i % 34 === 17) out.push(...leaf(cx, cy, 20, Math.PI - 0.5 - seed * 0.3, true));
  }
  out.push(...bud(cx + 1, cy + 10, 6, 'blush'));
  out.push(...flower(cx + 1, cy + 26, seed > 0.5 ? 13 : 10, seed > 0.7 ? 'blush' : 'pink', seed * 3));
  return out;
}
