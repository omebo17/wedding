import { Container, Graphics } from 'pixi.js';
import { BEAT } from './palette';

/** [x, y, width, height, colour, alpha?] — all values in scene pixels. */
export type Rect = [number, number, number, number, number, number?];

/** Builds one Graphics object out of a list of pixel rectangles. */
export function shape(rects: Rect[]): Graphics {
  const g = new Graphics();
  for (const [x, y, w, h, color, alpha] of rects) {
    g.rect(Math.round(x), Math.round(y), w, h).fill({ color, alpha: alpha ?? 1 });
  }
  return g;
}

/**
 * Turns an ASCII mask into rectangles. Each character maps to a colour;
 * '.' and ' ' are transparent. Horizontal runs are merged so the draw list
 * stays small. This is the easiest way to hand-edit a sprite: change the art
 * by typing over the characters.
 */
export function sprite(
  mask: string[],
  x: number,
  y: number,
  colors: Record<string, number>,
  s = 1,
): Rect[] {
  const out: Rect[] = [];
  const w = Math.max(...mask.map((row) => row.length));
  for (let row = 0; row < mask.length; row++) {
    let run = '';
    let start = 0;
    for (let col = 0; col <= w; col++) {
      const ch = mask[row][col] ?? '.';
      if (ch !== run) {
        if (run in colors) {
          out.push([x + start * s, y + row * s, (col - start) * s, s, colors[run]]);
        }
        run = ch;
        start = col;
      }
    }
  }
  return out;
}

/** Mix two colours. amount = 1 keeps `a`, 0 keeps `b`. */
export function mix(a: number, b: number, amount: number): number {
  const ch = (shift: number) =>
    Math.round((((a >> shift) & 0xff) * amount + ((b >> shift) & 0xff) * (1 - amount)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * A filled ellipse, one merged rect per row. On a fine grid this is what
 * gives round things — table tops, petals, glass — an actual curve
 * instead of a staircase.
 */
export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
  alpha = 1,
): Rect[] {
  const out: Rect[] = [];
  const top = Math.round(cy - ry);
  const bottom = Math.round(cy + ry);
  for (let y = top; y < bottom; y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - half);
    const w = Math.max(1, Math.round(half * 2));
    out.push([x0, y, w, 1, color, alpha]);
  }
  return out;
}

/** The bottom slice of an ellipse — cloth hems, light pools, shadows. */
export function ellipseBand(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  color: number,
  alpha = 1,
): Rect[] {
  return ellipse(cx, cy, rx, ry, color, alpha).filter((r) => {
    const t = (r[1] - (cy - ry)) / (ry * 2);
    return t >= from && t <= to;
  });
}

/**
 * Vertical gradient as a stack of thin bands, with a checkerboard dither
 * on each seam. Many small steps read as a smooth wash while every pixel
 * still lands on the grid.
 */
export function gradient(
  x: number,
  y: number,
  w: number,
  h: number,
  from: number,
  to: number,
  steps: number,
  dither = 4,
): Rect[] {
  const out: Rect[] = [];
  const band = h / steps;
  for (let i = 0; i < steps; i++) {
    const color = mix(to, from, i / (steps - 1));
    const y0 = Math.round(y + i * band);
    const y1 = Math.round(y + (i + 1) * band);
    out.push([x, y0, w, y1 - y0, color]);
    if (i > 0 && dither > 0) {
      const prev = mix(to, from, (i - 1) / (steps - 1));
      for (let dx = 0; dx < w; dx += dither * 2) {
        out.push([x + dx, y0, dither, dither, prev]);
        out.push([x + dx + dither, y0 - dither, dither, dither, color]);
      }
    }
  }
  return out;
}

/**
 * Two-link inverse kinematics. Given a root, a target and two bone
 * lengths, return the pair of angles in the limb() convention (0 points
 * straight down, positive swings towards -x). Authoring a pose by where
 * the hand goes beats guessing two joint angles.
 */
export function ik(
  root: [number, number],
  target: [number, number],
  l1: number,
  l2: number,
  bend: number,
): [number, number] {
  let dx = target[0] - root[0];
  let dy = target[1] - root[1];
  let d = Math.hypot(dx, dy);
  const min = Math.abs(l1 - l2) + 0.01;
  const max = l1 + l2 - 0.01;
  if (d < min) {
    const k = min / (d || 1);
    dx *= k;
    dy *= k;
    d = min;
  } else if (d > max) {
    const k = max / d;
    dx *= k;
    dy *= k;
    d = max;
  }
  const base = Math.atan2(dy, dx);
  const cos = Math.max(-1, Math.min(1, (d * d + l1 * l1 - l2 * l2) / (2 * d * l1)));
  const elbowDir = base + bend * Math.acos(cos);
  const ex = root[0] + Math.cos(elbowDir) * l1;
  const ey = root[1] + Math.sin(elbowDir) * l1;
  const ang = (ax: number, ay: number, bx: number, by: number) => Math.atan2(-(bx - ax), by - ay);
  return [ang(root[0], root[1], ex, ey), ang(ex, ey, root[0] + dx, root[1] + dy)];
}

/** Intersect a rect list with a box; anything outside is dropped. */
export function clip(rects: Rect[], bx: number, by: number, bw: number, bh: number): Rect[] {
  const out: Rect[] = [];
  for (const [x, y, w, h, color, alpha] of rects) {
    const x0 = Math.max(x, bx);
    const y0 = Math.max(y, by);
    const x1 = Math.min(x + w, bx + bw);
    const y1 = Math.min(y + h, by + bh);
    if (x1 <= x0 || y1 <= y0) continue;
    out.push([x0, y0, x1 - x0, y1 - y0, color, alpha]);
  }
  return out;
}

/**
 * Re-rasterise a sprite at a different size. Edges are rounded, not
 * sizes: a rect's right edge and its neighbour's left edge round to the
 * same pixel, so scaled art tiles without seams. Rounding here rather
 * than setting `scale` on the container is the difference between a
 * bigger sprite and a blurry one — every pixel still lands on the grid.
 */
export function scaleRects(rects: Rect[], s: number): Rect[] {
  if (s === 1) return rects;
  return rects.map(([x, y, w, h, color, alpha]) => {
    const x0 = Math.round(x * s);
    const y0 = Math.round(y * s);
    const x1 = Math.round((x + w) * s);
    const y1 = Math.round((y + h) * s);
    return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), color, alpha] as Rect;
  });
}

/**
 * Replace a Graphics object's contents. Limbs are rebuilt every frame from
 * a freshly computed angle: the motion is then as smooth as the clock,
 * while every pixel still lands on the grid — which is not true of a
 * rotated sprite.
 */
export function redraw(g: Graphics, rects: Rect[]): void {
  g.clear();
  for (const [x, y, w, h, color, alpha] of rects) {
    g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill({
      color,
      alpha: alpha ?? 1,
    });
  }
}

/** A container with a Graphics child, so the part can be rotated around its joint. */
export function joint(x: number, y: number, rects: Rect[]): Container {
  const c = new Container();
  c.position.set(x, y);
  c.addChild(shape(rects));
  return c;
}

/** Position on the beat clock, 0 → 1 across one beat. */
export function beatPhase(t: number, offset = 0): number {
  return ((t / BEAT + offset) % 1 + 1) % 1;
}

/** Smooth −1 → 1 wave over `beats` beats. */
export function wave(t: number, beats = 2, offset = 0): number {
  return Math.sin(((t / (BEAT * beats)) + offset) * Math.PI * 2);
}

/** 0 → 1 → 0 bounce, one hop per beat. Good for bobbing heads. */
export function hop(t: number, offset = 0): number {
  return Math.abs(Math.sin((beatPhase(t, offset)) * Math.PI));
}

/** Which slot of an n-step, one-step-per-beat cycle we are in. */
export function beatIndex(t: number, n: number): number {
  return ((Math.floor(t / BEAT) % n) + n) % n;
}

/**
 * A limb drawn as a pixel staircase instead of a rotated rectangle.
 * `angle` is 0 for straight down and grows anticlockwise on screen, so
 * Math.PI is straight up. Because the steps are worked out once, at build
 * time, every pixel lands square on the grid — a rotated Graphics would
 * give you a smooth diagonal wearing a pixel costume.
 */
export function limb(
  x0: number,
  y0: number,
  angle: number,
  len: number,
  w: number,
  color: number,
): { rects: Rect[]; x: number; y: number } {
  const dx = -Math.sin(angle);
  const dy = Math.cos(angle);
  const rects: Rect[] = [];
  const half = (w - 1) / 2;
  for (let i = 0; i <= len; i++) {
    rects.push([Math.round(x0 + dx * i - half), Math.round(y0 + dy * i - half), w, w, color]);
  }
  return { rects, x: x0 + dx * len, y: y0 + dy * len };
}

/** Open hand at the end of a limb: palm plus three spread fingertips. */
export function jazzHand(
  x: number,
  y: number,
  angle: number,
  skin: number,
  shade: number,
): Rect[] {
  const dx = -Math.sin(angle);
  const dy = Math.cos(angle);
  const px = -dy;
  const py = dx;
  const out: Rect[] = [
    [Math.round(x - 2), Math.round(y - 2), 4, 4, skin],
    [Math.round(x - 2), Math.round(y - 2), 1, 4, shade],
  ];
  for (const o of [-1.7, 0, 1.7]) {
    out.push([
      Math.round(x + dx * 3 + px * o - 0.5),
      Math.round(y + dy * 3 + py * o - 0.5),
      2,
      2,
      o > 1 ? shade : skin,
    ]);
  }
  return out;
}

/** Deterministic pseudo-random, so the crowd looks the same on every reload. */
export function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Snaps a container onto the pixel grid — stops sub-pixel jitter. */
export function snap(c: Container, x: number, y: number): void {
  c.position.set(Math.round(x), Math.round(y));
}
