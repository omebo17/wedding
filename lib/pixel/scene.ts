import { Container, Graphics } from 'pixi.js';
import { C, WORLD_H, WORLD_W } from './palette';
import { Actor, createCouple, createCrowdPerson, createRapper } from './characters';
import { bud, flower, leaf, vine } from './flowers';
import { createBride } from './bride';
import { createGroom } from './groom';
import { createPhotographer } from './photographer';
import { createRapper as createLakeRapper } from './rapper';
import { createTable } from './props';
import { clip, ellipse, gradient, hop, mix, rand, Rect, shape, wave } from './px';

export interface Scene {
  view: Container;
  /**
   * Everything that never changes — wall, arch, floor, riser. It is one
   * container so the renderer can bake it to a texture once instead of
   * re-drawing a hundred thousand rectangles every frame.
   */
  still: Container;
  update: (t: number) => void;
}

interface Part {
  view: Container;
  update: (t: number) => void;
}

/** Where the back wall meets the floor. */
const HORIZON = 470;
const CENTER = WORLD_W / 2;

/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- *
 * The venue
 *
 * Timber roof on exposed rafters with a black duct running through it, a
 * painted soffit over the left bay, stone and brick walls opened up with
 * arched windows and a wall of glazing onto the fields, and greenery hung
 * from the beams.
 * ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- *
 * Outside
 *
 * The landscape is built ONCE in world coordinates and then clipped to
 * each opening. Building it per window is what made every window show its
 * own horizon: the sky, the ridge, the shore and the lake now line up
 * across all three, as if you were looking through a wall of glass at one
 * valley.
 * ---------------------------------------------------------------- */

/** World y where the mountains meet the fields. */
const RIDGE_Y = 285;
/** World y above which no opening reaches. */
const OUT_TOP = 116;

function skyColorAt(y: number): number {
  const t = Math.max(0, Math.min(1, (y - OUT_TOP) / (RIDGE_Y - OUT_TOP)));
  return mix(C.skyPale, C.sky, t);
}

let landscapeCache: Rect[] | null = null;

function landscape(): Rect[] {
  if (landscapeCache) return landscapeCache;
  const out: Rect[] = [];

  // ---- sky, deeper overhead than at the horizon
  out.push(...gradient(0, OUT_TOP, WORLD_W, RIDGE_Y - OUT_TOP, C.sky, C.skyPale, 16, 0));
  for (const [cx, cy, cw] of [
    [150, 178, 62],
    [430, 216, 46],
    [700, 186, 74],
    [960, 226, 54],
    [1210, 180, 50],
  ] as const) {
    out.push(...ellipse(cx, cy, cw, cw * 0.38, C.cloud, 0.8));
    out.push(...ellipse(cx + cw * 0.55, cy + 4, cw * 0.55, cw * 0.26, C.cloud, 0.65));
    out.push(...ellipse(cx - cw * 0.5, cy + 5, cw * 0.4, cw * 0.2, C.cloud, 0.5));
  }

  // ---- mountain ridge
  for (let x = 0; x < WORLD_W; x++) {
    const k = x / 90;
    const peak = Math.round(
      18 + Math.sin(k) * 9 + Math.sin(k * 2.3 + 1.7) * 6 + Math.sin(k * 0.6) * 7,
    );
    out.push([x, RIDGE_Y - peak, 1, peak + 4, C.mountain]);
    out.push([x, RIDGE_Y - peak, 1, 2, mix(C.mountain, C.cloud, 0.55)]);
    if (x % 7 < 3) out.push([x, RIDGE_Y - Math.round(peak * 0.55), 1, 5, C.mountainDark, 0.45]);
  }
  // a second, nearer ridge
  for (let x = 0; x < WORLD_W; x++) {
    const k = x / 55 + 2.1;
    const peak = Math.round(8 + Math.sin(k) * 5 + Math.sin(k * 1.9) * 3);
    out.push([x, RIDGE_Y - peak, 1, peak + 3, mix(C.mountainDark, C.hedge, 0.5)]);
  }

  // ---- treeline, then the fields
  for (let x = 0; x < WORLD_W; x += 4) {
    const th = 5 + Math.round(rand(x * 1.7) * 5);
    out.push([x, RIDGE_Y + 2 - th, 4, th + 4, rand(x) > 0.5 ? C.hedge : C.fernDark]);
  }
  const fieldTop = RIDGE_Y + 6;
  out.push([0, fieldTop, WORLD_W, HORIZON - fieldTop, C.grass]);
  out.push([0, fieldTop, WORLD_W, 3, C.grassDark, 0.5]);
  for (let x = 0; x < WORLD_W; x += 3) {
    if (rand(x * 2.9) > 0.62) {
      out.push([x, fieldTop + 4 + Math.round(rand(x) * 10), 2, 2, C.grassDark, 0.5]);
    }
  }

  // ---- the lake
  //
  // Not an ellipse: the outline is a sum of sines with an envelope that
  // closes it off at both ends, so it has bays and headlands and reads as
  // water rather than as a shape.
  const LAKE_X0 = 80;
  const LAKE_X1 = 1200;
  const lakeCx = (LAKE_X0 + LAKE_X1) / 2;
  const lakeRx = (LAKE_X1 - LAKE_X0) / 2;
  // The lake sits high enough in the field that its near shore — and the
  // bridge crossing it — stay clear of the riser, which otherwise hides
  // everything below y=400 across the middle of the room.
  const lakeMid = (x: number) => 352 + Math.sin(x / 170) * 5 + Math.sin(x / 91 + 2.2) * 3;
  const lakeHalf = (x: number) => {
    const k = (x - lakeCx) / lakeRx;
    if (Math.abs(k) >= 1) return 0;
    const env = Math.pow(1 - k * k, 0.42);
    return (
      env *
      (46 + Math.sin(x / 70 + 1.1) * 8 + Math.sin(x / 29 + 2.2) * 4 + Math.sin(x / 13) * 2)
    );
  };

  for (let x = LAKE_X0; x <= LAKE_X1; x++) {
    const half = lakeHalf(x);
    if (half < 1.5) continue;
    const mid = lakeMid(x);
    const top = Math.round(mid - half);
    const bot = Math.round(mid + half);
    const h = bot - top;
    // damp sand, then wet sand, then water
    out.push([x, top - 5, 1, h + 12, C.shoreDark]);
    out.push([x, top - 3, 1, h + 8, C.shore]);
    out.push([x, top, 1, h, C.water]);
    out.push([x, top, 1, Math.min(6, h), C.waterDeep]);
    out.push([x, bot - 4, 1, 4, C.waterLight, 0.5]);
  }
  // the ridge reflected in the far water
  for (let x = LAKE_X0; x <= LAKE_X1; x += 1) {
    const half = lakeHalf(x);
    if (half < 6) continue;
    const top = Math.round(lakeMid(x) - half);
    if (x % 5 < 3) out.push([x, top + 5, 1, 3, C.mountainDark, 0.14]);
  }
  // ripples and sun glitter, kept inside the water
  const inWater = (x: number, y: number) => {
    const half = lakeHalf(x);
    if (half < 4) return false;
    const mid = lakeMid(x);
    return y > mid - half + 2 && y < mid + half - 2;
  };
  for (let i = 0; i < 90; i++) {
    const rx0 = Math.round(LAKE_X0 + rand(i * 3.3) * (LAKE_X1 - LAKE_X0));
    const ry0 = Math.round(304 + rand(i * 5.1) * 96);
    if (!inWater(rx0, ry0)) continue;
    const rw = 6 + Math.round(rand(i * 7.7) * 24);
    out.push([rx0, ry0, rw, 1, C.waterShine, 0.38]);
    if (inWater(rx0 + 4, ry0 + 2)) {
      out.push([rx0 + 4, ry0 + 2, Math.round(rw * 0.6), 1, C.waterShine, 0.2]);
    }
  }
  for (let i = 0; i < 14; i++) {
    const gx0 = Math.round(lakeCx - 30 + rand(i * 9.1) * 60);
    const gy0 = Math.round(lakeMid(gx0) - 22 + i * 4);
    if (!inWater(gx0, gy0)) continue;
    out.push([gx0, gy0, 6 + Math.round(rand(i) * 12), 1, C.waterShine, 0.5]);
  }

  // ---- the island
  //
  // Heart shaped, seen at the angle the room looks out at it: the classic
  // implicit heart, tested per pixel and squashed vertically, so the notch
  // at the top and the point at the bottom survive the foreshortening.
  const ix = lakeCx;
  const iy = 344;
  const irx = 104;
  const iry = 31;

  /** Is this pixel inside the heart, scaled by k? */
  const inHeart = (px: number, py: number, k = 1): boolean => {
    const u = ((px - ix) / (irx * k)) * 1.15;
    const v = (((iy + iry * k) - py) / (2 * iry * k)) * 2.35 - 1.3;
    const a = u * u + v * v - 1;
    return a * a * a - u * u * v * v * v <= 0;
  };

  /** Rows of the heart, merged into runs. */
  const heartRuns = (k: number, dy: number): Rect[] => {
    const out2: Rect[] = [];
    const top = Math.round(iy - iry * k) - 2;
    const bottom = Math.round(iy + iry * k) + 2;
    for (let py = top; py <= bottom; py++) {
      let run = -1;
      for (let px = Math.round(ix - irx * k) - 2; px <= Math.round(ix + irx * k) + 2; px++) {
        const hit = inHeart(px, py, k);
        if (hit && run < 0) run = px;
        if (!hit && run >= 0) {
          out2.push([run, py + dy, px - run, 1, 0]);
          run = -1;
        }
      }
      if (run >= 0) out2.push([run, py + dy, Math.round(ix + irx * k) + 3 - run, 1, 0]);
    }
    return out2;
  };

  const paint = (rows: Rect[], color: number, alpha = 1): Rect[] =>
    rows.map((r) => [r[0], r[1], r[2], r[3], color, alpha] as Rect);

  // wet sand, dry sand, then grass
  out.push(...paint(heartRuns(1.1, 4), C.shoreDark, 0.9));
  out.push(...paint(heartRuns(1.05, 2), C.shore));
  out.push(...paint(heartRuns(0.94, 0), C.islandGrass));
  out.push(...paint(heartRuns(0.72, -3), mix(C.islandGrass, C.cloud, 0.72), 0.4));
  out.push(...paint(heartRuns(0.5, 6), C.islandDark, 0.22));

  // ---- planting: a border of small flowers following the heart's edge
  //
  // Candidates are sampled on a jittered grid and kept only where they
  // land in the outer band — inside the heart at 0.95, outside it at 0.62 —
  // so the planting traces the outline instead of filling the middle.
  const border: Array<[number, number]> = [];
  for (let py = Math.round(iy - iry) - 3; py <= Math.round(iy + iry) + 3; py += 5) {
    for (let px = Math.round(ix - irx) - 3; px <= Math.round(ix + irx) + 3; px += 7) {
      const jx = px + Math.round((rand(px * 1.7 + py) - 0.5) * 5);
      const jy = py + Math.round((rand(px * 3.1 + py * 2.3) - 0.5) * 4);
      if (!inHeart(jx, jy, 0.96)) continue;
      if (inHeart(jx, jy, 0.62)) continue;
      border.push([jx, jy]);
    }
  }
  // back to front, so the near flowers overlap the ones behind them
  border.sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < border.length; i++) {
    const [px, py] = border[i];
    const pick = rand(i * 4.7);
    const r = 4 + Math.round(rand(i * 2.3) * 2);
    const tone = pick > 0.72 ? 'white' : pick > 0.46 ? 'blush' : pick > 0.2 ? 'pink' : 'cream';
    out.push([px, py, 1, r + 3, C.islandDark, 0.75]);
    out.push(...flower(px, py, r, tone, rand(i * 1.3) * 5));
  }

  // low wildflowers dotted over the grass in the middle
  for (let i = 0; i < 70; i++) {
    const px = Math.round(ix - irx + rand(i * 3.1) * irx * 2);
    const py = Math.round(iy - iry + rand(i * 5.7) * iry * 2);
    if (!inHeart(px, py, 0.72)) continue;
    const pick = rand(i * 7.3);
    const color =
      pick > 0.72 ? C.petalLight : pick > 0.45 ? C.petal : pick > 0.2 ? C.cream : C.bloomCore;
    out.push([px, py, 2, 2, color]);
    out.push([px, py, 1, 1, C.cream, 0.75]);
  }

  // ---- the ceremony arch, standing in the middle of the island
  //
  const ax = ix;
  const ay = iy + 9;
  const arcR = 31;
  const arcRy = 23;
  const springY = ay - 36;
  {
    // white posts
    for (const side of [-1, 1]) {
      const px = ax + side * (arcR - 3);
      // a darker edge either side, or the white disappears into the border
      out.push([Math.round(px - 4), springY, 8, ay - springY, C.woodDeep, 0.55]);
      out.push([Math.round(px - 3), springY, 6, ay - springY, C.cream]);
      out.push([Math.round(px + 1), springY, 2, ay - springY, C.clothDeep, 0.6]);
      out.push([Math.round(px - 3), springY, 2, ay - springY, C.cloth]);
      out.push([Math.round(px - 6), ay - 3, 12, 4, C.woodDeep, 0.5]);
      out.push([Math.round(px - 5), ay - 3, 10, 3, C.cloth]);
    }
    // the curved head, drawn as a ring: outer ellipse minus inner
    const ring = (ro: number, roY: number, ri: number, riY: number, color: number, alpha = 1) => {
      const outer = ellipse(ax, springY, ro, roY, 0).filter((r) => r[1] <= springY);
      const inner = new Map<number, Rect>();
      for (const r of ellipse(ax, springY, ri, riY, 0).filter((q) => q[1] <= springY)) {
        inner.set(r[1], r);
      }
      for (const r of outer) {
        const hole = inner.get(r[1]);
        if (!hole) {
          out.push([r[0], r[1], r[2], 1, color, alpha]);
        } else {
          out.push([r[0], r[1], hole[0] - r[0], 1, color, alpha]);
          out.push([hole[0] + hole[2], r[1], r[0] + r[2] - (hole[0] + hole[2]), 1, color, alpha]);
        }
      }
    };
    ring(arcR + 1, arcRy + 1, arcR - 6, arcRy - 6, C.woodDeep, 0.5);
    ring(arcR, arcRy, arcR - 5, arcRy - 5, C.cream);
    ring(arcR - 1, arcRy - 1, arcR - 3, arcRy - 3, C.cloth);
    // drapery hanging from the shoulders
    for (const side of [-1, 1]) {
      const dx = ax + side * (arcR - 5);
      out.push([Math.round(dx - 2), springY - 4, 5, 20, C.veil, 0.5]);
      out.push([Math.round(dx - 1), springY - 4, 2, 24, C.cream, 0.4]);
    }
    // flowers and greenery wrapping the head and the posts
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * (0.04 + (i / 16) * 0.92);
      const fx = ax - Math.cos(a) * (arcR - 2);
      const fy = springY - Math.sin(a) * (arcRy - 2);
      out.push(...leaf(fx, fy, 7, a + 1.4, i % 3 === 0));
      if (i % 2 === 0) {
        const tone = i % 6 === 0 ? 'white' : i % 4 === 0 ? 'blush' : 'pink';
        out.push(...flower(fx, fy, 5 + (i % 3), tone, i));
      }
    }
    for (const side of [-1, 1]) {
      const px = ax + side * (arcR - 3);
      for (let y = springY + 4; y < ay - 2; y += 7) {
        out.push(...leaf(px + side * 2, y, 6, side > 0 ? 0.7 : Math.PI - 0.7, true));
        if ((y - springY) % 14 === 4) out.push(...flower(px + side * 3, y + 2, 4, 'blush', y));
      }
      // a cluster at the foot
      out.push(...flower(px + side * 5, ay - 1, 5, 'pink', side));
      out.push(...flower(px - side * 2, ay + 1, 4, 'white', side + 2));
      out.push(...leaf(px + side * 8, ay, 8, side > 0 ? 2.4 : Math.PI - 2.4, true));
    }
  }

  // ---- footbridge, off the island's lower left, angled to the bank
  //
  // Humpbacked: the deck follows the straight line from island to shore
  // with a sine lifted out of the middle of the span, and the handrails
  // are offset from that same curve, so the whole thing bows as one.
  const bx0 = ix - 50;
  const by0 = iy + 17;
  const bx1 = ix - 104;
  const by1 = Math.min(396, Math.round(lakeMid(bx1) + lakeHalf(bx1) + 10));
  const HUMP = 11;
  const deckX = (t: number) => bx0 + (bx1 - bx0) * t;
  const deckY = (t: number) => by0 + (by1 - by0) * t - Math.sin(Math.PI * t) * HUMP;
  const deckW = (t: number) => 9 + t * 9;
  const STEPS = 160;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const w = Math.round(deckW(t));
    const x0 = Math.round(deckX(t) - w / 2);
    const y = Math.round(deckY(t));
    out.push([x0, y, w, 2, C.wood]);
    if (i % 12 === 0) out.push([x0, y, w, 1, C.woodDark, 0.55]);
    out.push([x0, y, 1, 2, C.woodDeep, 0.85]);
    out.push([x0 + w - 1, y, 1, 2, C.woodDeep, 0.85]);
    // underside, so the hump reads as a span and not a ribbon
    if (t > 0.04 && t < 0.96) {
      out.push([x0 + 1, y + 2, w - 2, 2, C.woodDeep, 0.5]);
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i <= STEPS; i += 10) {
      const t = i / STEPS;
      const px = Math.round(deckX(t) + (side * deckW(t)) / 2);
      out.push([px, Math.round(deckY(t)) - 8, 1, 8, C.woodDark]);
    }
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const px = Math.round(deckX(t) + (side * deckW(t)) / 2);
      out.push([px, Math.round(deckY(t)) - 8, 1, 2, C.woodLight]);
    }
  }
  // pilings under the ends, where the deck is closest to the water
  for (const t of [0.12, 0.88]) {
    out.push([Math.round(deckX(t) - deckW(t) / 2 + 1), Math.round(deckY(t)) + 3, 2, 7, C.woodDeep, 0.7]);
    out.push([Math.round(deckX(t) + deckW(t) / 2 - 2), Math.round(deckY(t)) + 3, 2, 7, C.woodDeep, 0.7]);
  }
  // path away from where it lands
  for (let i = 0; i < 12; i++) {
    const py = by1 + i;
    const pw = 14 + i;
    out.push([Math.round(bx1 - 4 - i * 0.8 - pw / 2), py, pw, 1, C.shore, 0.7]);
  }
  // the island reflected
  out.push(...paint(heartRuns(0.8, Math.round(iry * 1.9)), C.islandDark, 0.14));

  landscapeCache = out;
  return out;
}

/** The landscape as seen through one opening. */
function outsideView(x: number, y: number, w: number, h: number): Rect[] {
  return clip(landscape(), x, y, w, h);
}

/** Stone jambs, sill and lintel around an opening. */
function surround(x: number, y: number, w: number, h: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < h; i += 13) {
    const t = i % 26 === 0 ? C.stoneLight : C.stone;
    out.push([x - 9, y + i, 9, 12, t], [x + w, y + i, 9, 12, i % 26 === 0 ? C.stone : C.stoneLight]);
    out.push([x - 9, y + i + 11, 9, 2, C.stoneDeep, 0.5], [x + w, y + i + 11, 9, 2, C.stoneDeep, 0.5]);
  }
  // sill
  out.push([x - 12, y + h, w + 24, 6, C.stoneLight]);
  out.push([x - 12, y + h + 4, w + 24, 3, C.stoneDeep, 0.55]);
  return out;
}

/** A round-headed window: sky in the head, the view in the body. */
function archedWindow(cx: number, top: number, w: number, bodyH: number): Rect[] {
  const out: Rect[] = [];
  const r = w / 2;
  // head: the same sky as the landscape at that height, so the gradient
  // continues out of the window body without a step
  for (const rr of ellipse(cx, top, r, r * 0.92, 0).filter((q) => q[1] < top)) {
    out.push([rr[0], rr[1], rr[2], 1, skyColorAt(rr[1])]);
  }
  // stone voussoirs around the head
  const ring = ellipse(cx, top, r + 9, r * 0.92 + 9, C.stoneLight).filter((rr) => rr[1] < top);
  const inner = ellipse(cx, top, r, r * 0.92, 0).filter((rr) => rr[1] < top);
  const innerByY = new Map<number, Rect>();
  for (const rr of inner) innerByY.set(rr[1], rr);
  for (const rr of ring) {
    const hole = innerByY.get(rr[1]);
    const tone = (rr[1] % 18 < 9 ? C.stoneLight : C.stone);
    if (!hole) {
      out.push([rr[0], rr[1], rr[2], 1, tone]);
    } else {
      out.push([rr[0], rr[1], hole[0] - rr[0], 1, tone]);
      out.push([hole[0] + hole[2], rr[1], rr[0] + rr[2] - (hole[0] + hole[2]), 1, tone]);
    }
  }
  // body
  out.push(...outsideView(Math.round(cx - r), top, Math.round(w), bodyH));
  out.push(...surround(Math.round(cx - r), top, Math.round(w), bodyH));
  // mullion and a wooden frame
  out.push([Math.round(cx - 2), top - Math.round(r * 0.9), 4, bodyH + Math.round(r * 0.9), C.woodDark]);
  out.push([Math.round(cx - 2), top - Math.round(r * 0.9), 2, bodyH + Math.round(r * 0.9), C.wood]);
  out.push([Math.round(cx - r), top, Math.round(w), 3, C.woodDark]);
  return out;
}

/** A hanging fern: fronds spilling out of a pot on a rope. */
function hangingFern(x: number, y: number, len: number, seed: number): Rect[] {
  const out: Rect[] = [];
  // rope and pot
  out.push([x - 1, y - 26, 2, 26, C.cream, 0.7]);
  out.push([x - 9, y, 18, 9, C.woodDark], [x - 9, y, 18, 2, C.wood]);
  for (let i = 0; i < 9; i++) {
    const a = -1.15 + (i / 8) * 2.3 + (rand(seed + i) - 0.5) * 0.25;
    const l = len * (0.6 + rand(seed * 2.1 + i) * 0.5);
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    for (let t = 0; t < l; t++) {
      const px = Math.round(x + dx * t * 0.75);
      const py = Math.round(y + 6 + dy * t);
      out.push([px, py, 2, 2, i % 3 === 0 ? C.fernDark : C.fern]);
      if (t % 5 === 0) {
        out.push([px - 3, py, 3, 2, C.fern, 0.85], [px + 2, py + 1, 3, 2, C.fernDark, 0.85]);
      }
    }
  }
  return out;
}

/** Purple trailing plant hung from a beam. */
function hangingTrailer(x: number, y: number, len: number, seed: number): Rect[] {
  const out: Rect[] = [];
  out.push([x - 1, y - 18, 2, 18, C.cream, 0.6]);
  out.push([x - 8, y, 16, 8, C.woodDeep]);
  for (let i = 0; i < 5; i++) {
    const sway = (rand(seed + i * 3.7) - 0.5) * 16;
    let px = x - 6 + i * 3;
    for (let t = 0; t < len * (0.55 + rand(seed + i) * 0.6); t++) {
      px = x - 6 + i * 3 + Math.round(Math.sin(t / 14 + i) * 3 + (sway * t) / 90);
      const py = y + 7 + t;
      out.push([px, py, 2, 2, C.vinePlum]);
      if (t % 6 === 0) {
        out.push([px - 4, py, 5, 3, C.vinePlumLight, 0.9]);
        out.push([px + 2, py + 3, 5, 3, C.vinePlum]);
      }
    }
  }
  return out;
}

/**
 * The hanging lily basket the photographer swings from. Long enough that
 * its hoop comes down to y=246, which is where her gripping hand lands.
 */
function hangingLily(x: number, y: number, len: number): Rect[] {
  const out: Rect[] = [];
  const bottom = y + len;
  // three ropes down to the hoop
  for (const dx of [-13, 0, 13]) {
    for (let i = 0; i < len - 16; i++) {
      out.push([x + Math.round(dx * (1 - i / (len * 1.6))), y + i, 2, 1, C.cream, 0.75]);
    }
  }
  // the hoop she grabs
  out.push(...ellipse(x, bottom - 14, 20, 6, C.woodDark));
  out.push(...ellipse(x, bottom - 15, 17, 4, C.wood));
  out.push(...ellipse(x, bottom - 16, 14, 3, C.woodLight, 0.7));
  // basket under it, spilling greenery
  out.push(...ellipse(x, bottom - 8, 18, 8, C.woodDeep));
  out.push(...ellipse(x, bottom - 10, 16, 6, C.wood));
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + (i / 6) * 2.4;
    out.push(...leaf(x + Math.sin(a) * 12, bottom - 6, 22 + (i % 3) * 8, a + Math.PI * 0.5, i % 2 === 0));
  }
  // white lilies, one facing us
  out.push(...flower(x - 14, bottom - 18, 9, 'white', 1.2));
  out.push(...flower(x + 13, bottom - 16, 8, 'cream', 2.6));
  out.push(...flower(x, bottom - 24, 11, 'white', 0.4));
  out.push(...flower(x - 6, bottom - 12, 7, 'blush', 3.3));
  out.push(...flower(x + 7, bottom - 10, 7, 'white', 2.1));
  // a couple of trailing tendrils
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const tx = x + dir * (16 + Math.round(Math.sin(i / 6) * 5));
      out.push([tx, bottom - 4 + i, 2, 2, i % 6 === 0 ? C.fern : C.fernDark]);
    }
  }
  return out;
}

function backdrop(): Container {
  const rects: Rect[] = [];

  // ---------- walls: vertical timber boarding ----------
  const wallTop = 88;
  const wallH = HORIZON + 8 - wallTop;
  rects.push([0, wallTop, WORLD_W, wallH, C.woodDark]);
  for (let x = 0; x < WORLD_W; x += 15) {
    const t = rand(x * 1.7);
    const face = t > 0.76 ? C.woodWarm : t > 0.44 ? C.wood : t > 0.2 ? C.woodLight : C.woodDark;
    rects.push([x, wallTop, 13, wallH, face]);
    rects.push([x, wallTop, 2, wallH, mix(face, C.woodWarm, 0.55), 0.65]);
    rects.push([x + 13, wallTop, 2, wallH, C.woodDeep, 0.7]);
    // a few knots and grain marks
    if (t > 0.88) rects.push([x + 4, 150 + Math.round(rand(x) * 240), 4, 3, C.woodDeep, 0.5]);
  }
  // wall plate and a rail band across the boarding
  rects.push([0, wallTop, WORLD_W, 8, C.woodDeep]);
  rects.push([0, 118, WORLD_W, 12, C.wood]);
  rects.push([0, 118, WORLD_W, 3, C.woodLight, 0.85]);
  rects.push([0, 128, WORLD_W, 2, C.woodDeep]);
  // low stone plinth at the foot of the wall, mostly behind the tables
  for (let x = -24; x < WORLD_W + 24; x += 34) {
    const tone = rand(x * 2.3);
    const face = tone > 0.7 ? C.stoneLight : tone > 0.35 ? C.stone : C.stoneDark;
    rects.push([x + Math.round(rand(x) * 3), 442, 30, 16, face]);
    rects.push([x, 442, 30, 3, mix(face, C.stoneLight, 0.5)]);
  }
  rects.push([0, 436, WORLD_W, 7, C.wood], [0, 436, WORLD_W, 2, C.woodLight, 0.8]);
  rects.push([0, 458, WORLD_W, HORIZON + 8 - 458, C.stoneDeep, 0.4]);

  // ---------- openings: as much glass as the frame allows ----------
  rects.push(...archedWindow(200, 268, 250, 172));
  rects.push(...archedWindow(640, 262, 270, 178));
  // the glazed wall on the right
  const gx = 856;
  const gw = 392;
  const gy = 176;
  const gh = 264;
  rects.push(...outsideView(gx, gy, gw, gh));
  rects.push([gx - 6, gy - 8, gw + 12, 10, C.woodDark], [gx - 6, gy - 8, gw + 12, 3, C.wood]);
  rects.push([gx - 6, gy + gh, gw + 12, 12, C.woodDark], [gx - 6, gy + gh, gw + 12, 3, C.wood]);
  for (let i = 0; i <= 4; i++) {
    const x = gx + Math.round((gw * i) / 4);
    rects.push([x - 4, gy - 8, 8, gh + 20, C.woodDark]);
    rects.push([x - 4, gy - 8, 3, gh + 20, C.wood]);
  }
  rects.push([gx, gy + 96, gw, 6, C.woodDark, 0.95]);
  for (let i = 0; i < 5; i++) rects.push([gx + 16 + i * 78, gy, 14, gh, C.cloud, 0.09]);

  // ---------- timber posts, wrapped in ivy ----------
  for (const px of [408, 796]) {
    rects.push([px, wallTop, 34, HORIZON + 8 - wallTop, C.wood]);
    rects.push([px, wallTop, 9, HORIZON + 8 - wallTop, C.woodLight, 0.8]);
    rects.push([px + 27, wallTop, 7, HORIZON + 8 - wallTop, C.woodDeep, 0.75]);
    for (let y = 132; y < HORIZON; y += 7) {
      const sd = rand(px + y);
      const lx = px + (sd > 0.5 ? -4 : 26) + Math.round(Math.sin(y / 9) * 4);
      rects.push([lx, y, 8, 5, sd > 0.5 ? C.leaf : C.leafDark]);
      rects.push([lx + 2, y + 1, 3, 2, C.fern, 0.7]);
      rects.push([px + 14, y, 3, 7, C.leafDark, 0.5]);
    }
  }
  // corner posts
  for (const px of [0, WORLD_W - 30]) {
    rects.push([px, wallTop, 30, HORIZON + 8 - wallTop, C.woodDark]);
    rects.push([px, wallTop, 8, HORIZON + 8 - wallTop, C.wood]);
    rects.push([px + 24, wallTop, 6, HORIZON + 8 - wallTop, C.woodDeep]);
  }

  // ---------- ceiling: planks, rafters, tie beam, duct ----------
  rects.push(...gradient(0, 0, WORLD_W, 96, C.woodWarm, C.woodDark, 12, 0));
  for (let y = 5; y < 96; y += 9) rects.push([0, y, WORLD_W, 1, C.woodDeep, 0.4]);
  for (let x = 34; x < WORLD_W; x += 76) {
    rects.push([x, 0, 10, 96, C.wood]);
    rects.push([x, 0, 3, 96, C.woodLight, 0.8]);
    rects.push([x + 8, 0, 2, 96, C.woodDeep, 0.7]);
  }
  rects.push([0, 84, WORLD_W, 12, C.woodDark]);
  rects.push([0, 84, WORLD_W, 3, C.wood]);
  rects.push([0, 94, WORLD_W, 2, C.woodDeep]);
  rects.push([0, 58, WORLD_W, 20, C.duct]);
  rects.push([0, 60, WORLD_W, 4, C.ductLight, 0.85]);
  rects.push([0, 74, WORLD_W, 3, 0x000000, 0.3]);
  for (let x = 26; x < WORLD_W; x += 190) {
    rects.push([x, 56, 6, 24, C.ductLight, 0.5]);
  }

  // painted soffit over the left bay, sloping away from the corner
  for (let x = 0; x < 340; x++) {
    const h = Math.round(84 - x * 0.2);
    rects.push([x, 0, 1, h, C.teal]);
    rects.push([x, h - 4, 1, 4, C.tealDark]);
    if (x % 11 === 0) rects.push([x, 0, 1, h - 4, C.tealLight, 0.5]);
  }
  rects.push([0, 0, 340, 3, C.tealLight, 0.6]);
  // carved bracket where it lands
  rects.push([300, 20, 26, 44, C.tealLight]);
  rects.push([304, 24, 18, 36, C.teal]);
  for (let i = 0; i < 4; i++) {
    rects.push([306, 28 + i * 8, 14, 3, C.tealLight, 0.9]);
    rects.push([310, 30 + i * 8, 6, 3, C.tealDark, 0.7]);
  }

  // ---------- greenery hung from the beams ----------
  rects.push(...hangingFern(120, 96, 46, 1.3));
  rects.push(...hangingTrailer(232, 96, 82, 2.1));
  rects.push(...hangingFern(360, 96, 38, 3.7));
  rects.push(...hangingTrailer(520, 96, 58, 4.2));
  rects.push(...hangingFern(700, 96, 42, 5.9));
  rects.push(...hangingTrailer(760, 96, 70, 6.4));
  rects.push(...hangingFern(980, 96, 50, 7.1));
  rects.push(...hangingLily(1158, 96, 154));
  rects.push(...hangingFern(1240, 96, 44, 9.3));

  // warm lamp wash on the wall
  for (let i = 0; i < 4; i++) {
    rects.push(...ellipse(CENTER, 150 + i * 30, 380 - i * 40, 120 - i * 18, C.woodWarm, 0.05));
  }
  return shape(rects);
}

/** Bloom arch over the riser: garland ribbon, then blooms along it. */
function arch(): Container {
  const rects: Rect[] = [];
  const cx = CENTER;
  const cy = 560;
  const rx = 600;
  const ry = 452;

  // the greenery ribbon: overlapping leaves along the curve
  for (let i = 0; i <= 150; i++) {
    const a = Math.PI * (0.03 + (i / 150) * 0.94);
    const x = cx - Math.cos(a) * rx;
    const y = cy - Math.sin(a) * ry;
    const tangent = Math.atan2(Math.cos(a) * ry, Math.sin(a) * rx);
    if (i % 2 === 0) {
      rects.push(...leaf(x, y, 26 + rand(i * 1.7) * 16, tangent + 1.1 + rand(i) * 0.5, i % 4 === 0));
    } else {
      rects.push(...leaf(x, y, 24 + rand(i * 2.3) * 14, tangent - 1.1 - rand(i) * 0.5, i % 3 === 0));
    }
    rects.push([Math.round(x - 2), Math.round(y - 2), 5, 5, C.leafDark]);
  }

  // blooms, big ones clustered near the shoulders of the arch
  const count = 46;
  for (let i = 0; i < count; i++) {
    const a = Math.PI * (0.035 + (i / (count - 1)) * 0.93);
    const w = rand(i * 3.7);
    const rr = rx - 6 + w * 26;
    const rrY = ry - 6 + rand(i * 5.1) * 30;
    const x = cx - Math.cos(a) * rr;
    const y = cy - Math.sin(a) * rrY;
    if (w > 0.84) {
      rects.push(...bud(x, y, 7 + w * 4, w > 0.92 ? 'blush' : 'pink'));
    } else {
      const r = 11 + w * 12;
      const tone = w > 0.62 ? 'blush' : w > 0.24 ? 'pink' : 'white';
      rects.push(...flower(x, y, r, tone, w * 6));
    }
    // a smaller companion bloom just off the ribbon
    if (rand(i * 8.3) > 0.55) {
      const off = rand(i * 9.1) > 0.5 ? 26 : -26;
      rects.push(
        ...flower(x + off * 0.7, y + off * 0.5, 7 + rand(i * 4.4) * 4, 'cream', rand(i) * 5),
      );
    }
  }

  // vines dropping in from the top corners
  for (const [x, len, seed] of [
    [64, 150, 0.2],
    [186, 96, 0.8],
    [1096, 128, 0.6],
    [1216, 196, 0.35],
  ] as const) {
    rects.push(...vine(x, len, seed));
  }

  // greenery gathering at the feet of the arch
  rects.push(...leaf(30, HORIZON - 6, 90, -0.5), ...leaf(70, HORIZON - 2, 70, -0.9, true));
  rects.push(...leaf(1250, HORIZON - 6, 90, Math.PI + 0.5), ...leaf(1210, HORIZON - 2, 70, Math.PI + 0.9, true));
  rects.push(...flower(52, HORIZON - 40, 16, 'pink', 1.2), ...flower(96, HORIZON - 18, 12, 'blush', 2.4));
  rects.push(...flower(1228, HORIZON - 44, 16, 'blush', 0.6), ...flower(1184, HORIZON - 16, 12, 'pink', 3.1));
  return shape(rects);
}

/**
 * Slate floor. Square tiles laid in perspective — the rows get taller and
 * the grid lines converge on the middle of the horizon — with a polished
 * sheen down the centre and a timber threshold at the terrace edge.
 */
/**
 * Light timber floor. The boards run away from the camera, so their seams
 * converge on the middle of the horizon — that convergence is what gives
 * a flat band of pixels a floor's depth. Faces are stepped every few rows
 * rather than recomputed per row: the boards turn slowly, and the stair
 * that leaves behind is a pixel wide.
 */
function floor(): Container {
  const rects: Rect[] = [];
  rects.push([0, HORIZON, WORLD_W, WORLD_H - HORIZON, C.deck]);

  const depth = (y: number) => (y - HORIZON + 34) / (WORLD_H - HORIZON + 34);
  const full = depth(WORLD_H);
  const xAt = (bx: number, y: number) => CENTER + ((bx - CENTER) * depth(y)) / full;

  const boards: number[] = [];
  for (let bx = -2200; bx <= WORLD_W + 2200; bx += 62) boards.push(bx);

  // board faces
  for (let i = 0; i + 1 < boards.length; i++) {
    const tone = rand(i * 7.3);
    const face =
      tone > 0.86 ? C.deckPale : tone > 0.56 ? C.deckLight : tone > 0.2 ? C.deck : C.deckDark;
    const f = mix(face, C.deck, 0.4);
    for (let y = HORIZON; y < WORLD_H; y += 4) {
      const xa = Math.round(xAt(boards[i], y + 2));
      const xb = Math.round(xAt(boards[i + 1], y + 2));
      if (xb <= 0 || xa >= WORLD_W) continue;
      rects.push([xa, y, Math.max(1, xb - xa), Math.min(4, WORLD_H - y), f]);
    }
    // grain: a couple of faint streaks along the board, near half only —
    // in the distance the boards are a few pixels wide and any detail there
    // collapses into hatching
    for (let g = 0; g < 2; g++) {
      const k = 0.3 + rand(i * 3.1 + g) * 0.4;
      for (let y = HORIZON + Math.round((WORLD_H - HORIZON) * 0.42); y < WORLD_H; y += 6) {
        const xa = xAt(boards[i], y);
        const xb = xAt(boards[i + 1], y);
        const x = Math.round(xa + (xb - xa) * k);
        if (x < 0 || x >= WORLD_W) continue;
        rects.push([x, y, 1, 6, C.deckSeam, 0.12]);
      }
    }
    // plank ends, staggered board to board
    for (let e = 0; e < 3; e++) {
      const t = 0.18 + rand(i * 5.9 + e * 2.3) * 0.78;
      const y = Math.round(HORIZON + (WORLD_H - HORIZON) * t);
      const xa = Math.round(xAt(boards[i], y));
      const xb = Math.round(xAt(boards[i + 1], y));
      if (xb <= 0 || xa >= WORLD_W || xb - xa < 8) continue;
      const th = depth(y) / full > 0.5 ? 2 : 1;
      rects.push([xa, y, xb - xa, th, C.deckSeam, 0.45]);
    }
  }

  // seams between boards, fading out where the boards get too narrow to
  // hold a line
  const gap = 62;
  for (const bx of boards) {
    for (let y = HORIZON; y < WORLD_H; y += 2) {
      const x = Math.round(xAt(bx, y));
      if (x < 0 || x >= WORLD_W) continue;
      const spacing = xAt(bx + gap, y) - xAt(bx, y);
      if (spacing < 4) continue;
      const t = depth(y) / full;
      const a = spacing < 9 ? 0.18 : spacing < 16 ? 0.32 : 0.5;
      rects.push([x, y, t > 0.6 ? 2 : 1, 2, C.deckSeam, a]);
    }
  }

  // a dark reveal where the floor meets the wall
  rects.push([0, HORIZON, WORLD_W, 4, C.deckSeam, 0.55]);
  rects.push([0, HORIZON + 4, WORLD_W, 3, C.deckDark, 0.5]);

  // polish: the room reflecting back off the boards
  for (let i = 0; i < 9; i++) {
    rects.push(
      ...ellipse(CENTER, HORIZON + 34 + i * 26, 190 + i * 42, 16 + i * 5, C.cream, 0.055),
    );
  }
  for (const [cx, w] of [
    [300, 90],
    [980, 110],
  ] as const) {
    for (let i = 0; i < 6; i++) {
      rects.push(
        ...ellipse(cx, HORIZON + 30 + i * 30, w * (0.5 + i * 0.09), 12 + i * 4, C.cream, 0.035),
      );
    }
  }
  return shape(rects);
}

function stringLights(): Part {
  const view = new Container();
  const wire: Rect[] = [];
  const bulbs: Graphics[] = [];
  const sag = (x: number) => 28 + Math.round(Math.sin((x / WORLD_W) * Math.PI * 3) * 20);
  for (let x = 0; x < WORLD_W; x++) {
    wire.push([x, sag(x), 1, 2, C.plumWire, 0.6]);
  }
  view.addChild(shape(wire));
  for (let x = 40; x < WORLD_W; x += 80) {
    const b = shape([
      // socket
      [-2, 0, 5, 4, C.plumDeep],
      [-2, 0, 5, 1, C.plumWire],
      // glass
      ...ellipse(0.5, 8, 5, 6, C.gold),
      ...ellipse(0.5, 8, 3.4, 4.4, C.bloomCore),
      ...ellipse(-1, 6, 1.4, 2, C.spark),
      ...ellipse(0.5, 8, 8, 9, C.gold, 0.12),
    ]);
    b.position.set(x, sag(x) + 2);
    bulbs.push(b);
    view.addChild(b);
  }
  return {
    view,
    update(t: number) {
      for (let i = 0; i < bulbs.length; i++) {
        bulbs[i].alpha = 0.72 + 0.28 * Math.sin(t * 2.4 + i * 0.7);
      }
    },
  };
}

/** The riser the band plays on. */
function riser(): Container {
  const x0 = 464;
  const w = 352;
  const top = 400;
  return shape([
    // top surface
    ...[0].flatMap(() => [] as Rect[]),
    [x0, top, w, 18, C.stageTop],
    [x0, top, w, 3, mix(C.stageTop, C.cream, 0.7)],
    // front face
    [x0, top + 18, w, 52, C.stage],
    [x0, top + 56, w, 14, C.stageDark],
    [x0, top + 18, w, 2, mix(C.stage, C.cream, 0.85)],
    // side returns
    [x0, top + 18, 10, 52, C.stageDark],
    [x0 + w - 10, top + 18, 10, 52, C.stageDark],
    // panel inlay with a gold band
    [x0 + 26, top + 28, w - 52, 26, mix(C.stage, C.plumDeep, 0.8)],
    [x0 + 30, top + 32, w - 60, 18, C.goldDark, 0.5],
    [x0 + 34, top + 36, w - 68, 4, C.gold, 0.65],
    [x0 + 34, top + 44, w - 68, 2, C.goldDark, 0.7],
    // feet
    [x0 + 16, top + 70, 22, 6, C.stageDark],
    [x0 + w - 38, top + 70, 22, 6, C.stageDark],
  ]);
}

/** Speaker stacks flanking the riser, thumping on the beat. */
function speakers(): Part {
  const view = new Container();
  const boxes: Container[] = [];
  for (const x of [368, 912]) {
    const box = new Container();
    box.position.set(x, HORIZON + 2);
    const rects: Rect[] = [
      // cabinet
      [-40, -128, 80, 128, C.speaker],
      [-40, -128, 80, 4, C.speakerLip],
      [24, -128, 16, 128, C.speakerDark],
      [-40, -8, 80, 8, C.speakerDark],
      [-40, -128, 4, 128, mix(C.speaker, C.cream, 0.88)],
      // grille recess
      [-30, -114, 54, 52, C.speakerDark],
      [-30, -52, 54, 28, C.speakerDark],
    ];
    // woofer
    rects.push(
      ...ellipse(-3, -88, 24, 24, C.speakerLip),
      ...ellipse(-3, -88, 21, 21, C.speakerCone),
      ...ellipse(-3, -88, 13, 13, C.speakerDark),
      ...ellipse(-3, -88, 7, 7, C.speakerLip),
      ...ellipse(-6, -92, 3, 3, C.cream, 0.5),
    );
    // tweeter
    rects.push(
      ...ellipse(-3, -38, 12, 10, C.speakerCone),
      ...ellipse(-3, -38, 6, 5, C.speakerDark),
    );
    // grille mesh over the recesses
    for (let gy = -114; gy < -24; gy += 3) {
      for (let gx = -30; gx < 24; gx += 3) {
        if (gy > -58 && gy < -52) continue;
        rects.push([gx, gy, 1, 1, C.speakerLip, 0.22]);
      }
    }
    rects.push(
      // handle and badge
      [-34, -22, 18, 6, C.speakerLip],
      [-34, -22, 18, 2, C.speakerCone, 0.6],
      [4, -20, 20, 4, C.gold, 0.55],
      [4, -20, 20, 1, C.bloomCore, 0.7],
    );
    rects.unshift(...ellipse(0, 0, 52, 9, C.floorDark, 0.25));
    box.addChild(shape(rects));
    boxes.push(box);
    view.addChild(box);
  }
  return {
    view,
    update(t: number) {
      const b = hop(t);
      for (const box of boxes) box.scale.set(1 + b * 0.02, 1 + b * 0.03);
    },
  };
}

/** Notes drifting up out of the microphone. */
function notes(ox: number, oy: number, count = 5): Part {
  const view = new Container();
  const bits: Array<{ g: Graphics; seed: number }> = [];
  for (let i = 0; i < count; i++) {
    const g = shape([
      [12, -26, 5, 30, C.plumDeep],
      [16, -30, 12, 8, C.plumDeep],
      ...ellipse(6, 4, 8, 6, C.plumDeep),
      ...ellipse(6, 3, 4, 3, C.gold, 0.7),
    ]);
    bits.push({ g, seed: rand(i * 17.3) });
    view.addChild(g);
  }
  return {
    view,
    update(t: number) {
      for (let i = 0; i < bits.length; i++) {
        const { g, seed } = bits[i];
        const p = ((t * 0.32 + seed) % 1 + 1) % 1;
        g.position.set(
          Math.round(ox + seed * 36 + Math.sin(p * 7 + seed * 6) * 44),
          Math.round(oy - p * 180),
        );
        g.alpha = p < 0.15 ? p / 0.15 : 1 - Math.max(0, (p - 0.6) / 0.4);
      }
    },
  };
}

function petals(count = 70): Part {
  const view = new Container();
  const bits: Array<{ g: Graphics; x: number; y: number; speed: number; drift: number; seed: number; spin: number }> = [];
  for (let i = 0; i < count; i++) {
    const r = rand(i * 3.1);
    const size = 3 + r * 5;
    const g = shape([
      ...ellipse(0, 0, size, size * 0.62, r > 0.6 ? C.petalLight : C.petal),
      ...ellipse(-size * 0.2, -size * 0.2, size * 0.45, size * 0.28, C.cream, 0.6),
      ...ellipse(size * 0.3, size * 0.2, size * 0.4, size * 0.24, C.petalDark, 0.7),
    ]);
    g.alpha = 0.7 + r * 0.3;
    bits.push({
      g,
      x: rand(i * 7.7) * WORLD_W,
      y: rand(i * 11.3) * WORLD_H,
      speed: 26 + rand(i * 5.5) * 54,
      drift: 14 + rand(i * 2.2) * 40,
      seed: rand(i * 9.9) * 6,
      spin: 0.6 + rand(i * 4.1),
    });
    view.addChild(g);
  }
  return {
    view,
    update(t: number) {
      for (const p of bits) {
        p.y += p.speed / 60;
        if (p.y > WORLD_H + 12) {
          p.y = -12;
          p.x = rand(p.seed * 31.4 + p.y) * WORLD_W;
        }
        p.g.position.set(Math.round(p.x + Math.sin(t * 1.4 + p.seed) * p.drift), Math.round(p.y));
        p.g.scale.y = Math.cos(t * p.spin + p.seed) * 0.7 + 0.3;
      }
    },
  };
}

function sparkles(count = 30): Part {
  const view = new Container();
  const bits: Array<{ g: Graphics; phase: number }> = [];
  for (let i = 0; i < count; i++) {
    const g = shape([
      [2, 0, 2, 11, C.spark],
      [0, 5, 6, 2, C.spark],
      [1, 4, 4, 4, C.cream],
    ]);
    g.position.set(Math.round(rand(i * 4.3) * WORLD_W), Math.round(30 + rand(i * 6.1) * 420));
    bits.push({ g, phase: rand(i * 8.8) });
    view.addChild(g);
  }
  return {
    view,
    update(t: number) {
      for (const b of bits) {
        const p = (t * 0.9 + b.phase) % 1;
        b.g.alpha = p < 0.35 ? Math.sin((p / 0.35) * Math.PI) : 0;
        b.g.scale.set(0.6 + b.g.alpha * 0.6);
      }
    },
  };
}

function spotlights(): Part {
  const view = new Container();
  const beams: Graphics[] = [];
  for (let i = 0; i < 2; i++) {
    const g = new Graphics();
    g.poly([0, 0, -140, 560, 150, 560]).fill({ color: C.spark, alpha: 0.075 });
    g.position.set(i === 0 ? CENTER - 136 : CENTER + 136, 0);
    beams.push(g);
    view.addChild(g);
  }
  return {
    view,
    update(t: number) {
      beams[0].rotation = Math.sin(t * 0.6) * 0.2;
      beams[1].rotation = Math.sin(t * 0.6 + 2.1) * -0.2;
      beams[0].alpha = 0.7 + hop(t) * 0.3;
      beams[1].alpha = 0.7 + hop(t, 0.5) * 0.3;
    },
  };
}

/* ---------------------------------------------------------------- */

/**
 * Set to true to put the couple, the rapper and the guests back on the
 * floor. False leaves the room itself — arch, lights, floor, riser,
 * speakers, tables, petals — with nobody in it. Nothing is deleted
 * either way; the rigs still live in lib/pixel/characters.ts.
 *
 * Note: those rigs are drawn for the old 320x180 grid, so they are put
 * inside a container scaled by PEOPLE_SCALE until they are redrawn at
 * this resolution.
 */
const PEOPLE: boolean = false;
const PEOPLE_SCALE = 4;

export function buildScene(): Scene {
  const view = new Container();
  const actors: Actor[] = [];
  const parts: Part[] = [];

  const add = (p: Part) => {
    parts.push(p);
    view.addChild(p.view);
    return p;
  };

  const still = new Container();
  still.addChild(backdrop(), arch(), floor(), riser());
  view.addChild(still);

  // He performs outside on the near bank of the lake, so he is clipped to
  // the centre window's opening and goes down straight after the wall.
  // Back on his mark, with the clearance the arm needs: mid-pump his fist
  // reaches shoulder + UPPER + FORE + its own radius, and the centre
  // window's glass stops at x=775. Any further right and the clip cuts his
  // hand off at the jamb.
  const lakeRapper = createLakeRapper(728, 404, [506, 200, 268, 248]);
  view.addChild(lakeRapper.view);
  parts.push(lakeRapper);

  add(sparkles());

  const people = new Container();
  people.scale.set(PEOPLE_SCALE);

  // back row, half hidden behind the riser and the speakers
  const backRow = new Container();
  if (PEOPLE) {
    for (let i = 0; i < 15; i++) {
      const p = createCrowdPerson({ seed: i + 1, depth: 0 });
      p.view.position.set(6 + i * 22 + Math.round(rand(i * 2.7) * 7), 117 + Math.round(rand(i * 3.3) * 4));
      backRow.addChild(p.view);
      actors.push(p);
    }
  }
  people.addChild(backRow);
  view.addChild(people);

  add(speakers());

  if (PEOPLE) {
    const rapper = createRapper();
    rapper.view.position.set(196, 101);
    people.addChild(rapper.view);
    actors.push(rapper);

    // notes rise out of his mic, so they only make sense with him up there
    add(notes(816, 216));

    const sideSpots = [12, 34, 56, 78, 242, 264, 286, 308];
    for (let i = 0; i < sideSpots.length; i++) {
      const p = createCrowdPerson({ seed: i + 40, depth: 1 });
      p.view.position.set(sideSpots[i], 140 + Math.round(rand(i * 5.1) * 5));
      people.addChild(p.view);
      actors.push(p);
    }

    const couple = createCouple();
    couple.view.position.set(160, 142);
    people.addChild(couple.view);
    actors.push(couple);
  }

  // guest tables: two each side, the nearer pair bigger and closer in.
  // The far pair goes down before the bride, the near pair after, so she
  // sits in the room rather than on top of it.
  const farTables = [createTable(146, 552, 0.91, 1, '3'), createTable(1150, 546, 0.94, 2, '4')];
  const nearTables = [createTable(292, 650, 1.13, 3, '1'), createTable(1002, 662, 1.2, 4, '2')];
  for (const tb of farTables) {
    parts.push(tb);
    view.addChild(tb.view);
  }

  // She stands at the depth of the far tables: at 116px tall that is the
  // spot where she and the furniture agree on scale.
  const groom = createGroom();
  groom.view.position.set(CENTER - 68, 584);
  view.addChild(groom.view);
  parts.push(groom);

  const bride = createBride();
  bride.view.position.set(CENTER, 584);
  view.addChild(bride.view);
  parts.push(bride);

  for (const tb of nearTables) {
    parts.push(tb);
    view.addChild(tb.view);
  }

  // she moves all over the room, so she goes in front of the furniture
  const photographer = createPhotographer();
  view.addChild(photographer.view);
  parts.push(photographer);

  if (PEOPLE) {
    // foreground guests, cropped by the bottom edge
    const frontSpots = [-2, 34, 72, 110, 214, 252, 290, 324];
    for (let i = 0; i < frontSpots.length; i++) {
      const p = createCrowdPerson({ seed: i + 80, depth: 2, cheering: i % 3 === 0 });
      p.view.position.set(frontSpots[i], 197 + Math.round(rand(i * 6.6) * 7));
      people.addChild(p.view);
      actors.push(p);
    }
  }

  add(spotlights());
  add(petals());
  add(stringLights());

  // corner vignette
  view.addChild(
    shape([
      ...gradient(0, 0, WORLD_W, 26, C.stoneDeep, C.stoneDeep, 2, 0).map(
        (r) => [r[0], r[1], r[2], r[3], r[4], 0.12] as Rect,
      ),
      [0, WORLD_H - 26, WORLD_W, 26, C.stoneDeep, 0.14],
      [0, 0, 30, WORLD_H, C.stoneDeep, 0.12],
      [WORLD_W - 30, 0, 30, WORLD_H, C.stoneDeep, 0.12],
    ]),
  );

  return {
    view,
    still,
    update(t: number) {
      for (const a of actors) a.update(t);
      for (const p of parts) p.update(t);
      backRow.x = Math.round(wave(t, 8) * 1);
    },
  };
}
