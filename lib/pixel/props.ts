import { Container, Graphics } from 'pixi.js';
import { C } from './palette';
import { bud, flower, leaf } from './flowers';
import { ellipse, mix, rand, Rect, shape, sprite, wave } from './px';

export interface Prop {
  view: Container;
  update: (t: number) => void;
}

/** 3x5 numerals for the table cards. */
const DIGITS: Record<string, string[]> = {
  '1': ['.n.', 'nn.', '.n.', '.n.', 'nnn'],
  '2': ['nnn', '..n', 'nnn', 'n..', 'nnn'],
  '3': ['nnn', '..n', 'nnn', '..n', 'nnn'],
  '4': ['n.n', 'n.n', 'nnn', '..n', '..n'],
  '5': ['nnn', 'n..', 'nnn', '..n', 'nnn'],
  '6': ['nnn', 'n..', 'nnn', 'n.n', 'nnn'],
};

/**
 * A chiavari-style chair: two posts, a crowned top rail, slats, a round
 * cushion and tapering legs. Drawn from the point where its front legs
 * meet the floor, so it can be dropped beside a table at any depth.
 */
function chair(cx: number, baseY: number, cs: number, tone = 0): Rect[] {
  const out: Rect[] = [];
  const w = 40 * cs;
  const post = Math.max(2, Math.round(4.5 * cs));
  const seatY = baseY - 26 * cs;
  const backH = 42 * cs;
  const light = tone === 0 ? C.chair : C.chairDark;
  const dark = tone === 0 ? C.chairDark : C.chairDeep;

  // back legs, then the frame
  out.push([Math.round(cx - w * 0.34), Math.round(seatY - 4 * cs), post, Math.round(30 * cs), dark]);
  out.push([Math.round(cx + w * 0.34 - post), Math.round(seatY - 4 * cs), post, Math.round(30 * cs), dark]);
  // uprights
  out.push([Math.round(cx - w / 2), Math.round(seatY - backH), post, Math.round(backH), light]);
  out.push([Math.round(cx + w / 2 - post), Math.round(seatY - backH), post, Math.round(backH), dark]);
  // top rail with a crown
  out.push([Math.round(cx - w / 2), Math.round(seatY - backH), Math.round(w), Math.round(5 * cs), light]);
  out.push([Math.round(cx - w / 2), Math.round(seatY - backH), Math.round(w), 1, C.cream]);
  out.push(...ellipse(cx, seatY - backH - 1 * cs, w * 0.18, 3 * cs, light));
  // slats
  for (let i = 1; i <= 3; i++) {
    const sy = seatY - backH + (backH * i) / 4.2;
    out.push([
      Math.round(cx - w / 2 + post),
      Math.round(sy),
      Math.round(w - post * 2),
      Math.max(1, Math.round(2.5 * cs)),
      dark,
    ]);
  }
  // sash bow
  out.push(...ellipse(cx - 4 * cs, seatY - backH * 0.5, w * 0.16, 3.4 * cs, C.petal));
  out.push(...ellipse(cx + 4 * cs, seatY - backH * 0.5, w * 0.16, 3.4 * cs, C.petal));
  out.push(...ellipse(cx, seatY - backH * 0.5, w * 0.07, 2.6 * cs, C.petalDark));
  // cushion
  out.push(...ellipse(cx, seatY, w * 0.58, 7 * cs, light));
  out.push(...ellipse(cx, seatY - 2 * cs, w * 0.54, 6 * cs, C.petalLight));
  out.push(...ellipse(cx, seatY - 3 * cs, w * 0.4, 4 * cs, C.cream, 0.6));
  // front legs
  out.push([Math.round(cx - w * 0.44), Math.round(seatY), post, Math.round(26 * cs), light]);
  out.push([Math.round(cx + w * 0.44 - post), Math.round(seatY), post, Math.round(26 * cs), dark]);
  out.push([Math.round(cx - w * 0.44), Math.round(seatY + 14 * cs), Math.round(w * 0.88), Math.max(1, Math.round(2 * cs)), dark]);
  return out;
}

/* ------------------------------------------------------------------ *
 * A guest in a chair
 *
 * Drawn from the seat: hips at the origin, head about 44px up at full
 * scale. They are watching the couple, so the eyes and the parting sit a
 * pixel towards `facing` (-1 looking left, +1 looking right). The head
 * comes back separately so it can be given its own container and bobbed
 * without redrawing anybody.
 * ------------------------------------------------------------------ */
function guestRects(
  seed: number,
  cs: number,
  facing: number,
  /** Distance from the seat down to the floor, in guest units. */
  legLen: number,
): { body: Rect[]; head: Rect[]; headY: number } {
  const body: Rect[] = [];
  const head: Rect[] = [];
  const r1 = rand(seed * 3.1);
  const r2 = rand(seed * 7.7);
  const r3 = rand(seed * 11.3);
  const r4 = rand(seed * 5.9);
  const r5 = rand(seed * 13.1);

  const dressColour = C.wear[Math.floor(r1 * C.wear.length)];
  const trim = C.wear[Math.floor(rand(seed * 2.7) * C.wear.length)];
  const dress = rand(seed * 5.9) > 0.5;
  // the men are all in black tie, the women in colour
  const wear = dress ? dressColour : C.blackSuit;
  const wearDark = dress ? mix(dressColour, C.plumDeep, 0.66) : C.blackSuit;
  const wearLight = dress ? mix(dressColour, C.cream, 0.7) : C.blackSuitEdge;
  const hair = C.hairTones[Math.floor(r2 * C.hairTones.length)];
  const hairDark = mix(hair, C.plumDeep, 0.7);
  const hairLit = mix(hair, C.cream, 0.72);
  const skin = r3 > 0.62 ? C.skinDeep : r3 > 0.3 ? C.skin : mix(C.skin, C.skinDeep, 0.5);
  const skinShade = mix(skin, C.plumDeep, 0.76);
  const glass = r5 > 0.55;

  const p = (n: number) => Math.round(n * cs);
  const u = (n: number) => n * cs;
  const px = (x: number, y: number, w: number, h: number, c: number, a?: number): Rect =>
    [p(x), p(y), Math.max(1, p(w)), Math.max(1, p(h)), c, a] as Rect;

  // ---- legs: thighs forward off the seat, shins down to the floor
  {
    const knee = 9;
    const floor = Math.max(knee + 6, legLen);
    const trousers = dress ? skin : C.blackSuit;
    const trousersDark = dress ? skinShade : C.blackSuitEdge;
    for (const side of [-1, 1]) {
      const hx = side * 5;
      // thigh, foreshortened
      body.push(px(hx - (side > 0 ? 0 : 7), -3, 7, knee + 4, dress ? dressColour : C.blackSuit));
      body.push(px(hx - (side > 0 ? 0 : 7), -3, 2, knee + 4, dress ? mix(dressColour, C.plumDeep, 0.6) : C.blackSuitEdge));
      // shin
      body.push(px(hx - (side > 0 ? 0 : 6), knee, 6, floor - knee, trousers));
      body.push(px(hx - (side > 0 ? 0 : 6), knee, 2, floor - knee, trousersDark, 0.8));
      // shoe or heel
      if (dress) {
        body.push(px(hx - (side > 0 ? 1 : 6), floor - 2, 7, 3, C.petalDark));
        body.push(px(hx - (side > 0 ? 1 : 6), floor - 2, 7, 1, C.petalLight, 0.8));
        body.push(px(hx + (side > 0 ? 4 : -3), floor + 1, 2, 3, C.petalDark));
      } else {
        body.push(px(hx - (side > 0 ? 1 : 7), floor - 2, 8, 3, C.blackSuit));
        body.push(px(hx - (side > 0 ? 1 : 7), floor - 2, 8, 1, C.blackSuitLift, 0.7));
      }
    }
    if (dress) {
      // the skirt drapes over the lap and hides the thighs
      for (let y = -6; y < 8; y++) {
        const w = Math.round(15 + (y + 6) * 0.7);
        const half = Math.round(w / 2);
        body.push(px(-half, y, w, 2, dressColour));
        body.push(px(-half, y, 3, 2, mix(dressColour, C.plumDeep, 0.55)));
        body.push(px(half - 2, y, 2, 2, mix(dressColour, C.cream, 0.65), 0.4));
      }
      body.push(px(-9, 7, 18, 2, mix(dressColour, C.plumDeep, 0.45)));
    }
  }

  // ---- torso: shoulders down to the seat
  for (let y = -32; y < 0; y++) {
    const t = (y + 32) / 32;
    const w = Math.round(20 - t * 5);
    const half = Math.round(w / 2);
    body.push(px(-half, y, w, 2, wear));
    body.push(px(-half, y, 4, 2, wearDark));
    body.push(px(half - 2, y, 2, 2, wearLight, 0.35));
  }
  // shoulder line
  body.push(px(-11, -32, 22, 3, wear));
  body.push(px(-11, -32, 22, 1, wearLight, 0.6));

  if (dress) {
    // neckline, straps, sash, necklace
    body.push(px(-8, -33, 16, 4, skin));
    body.push(px(-8, -33, 3, 5, wear));
    body.push(px(5, -33, 3, 5, wear));
    body.push(px(-5, -29, 10, 2, skin));
    body.push(px(-4, -28, 8, 2, wearLight, 0.85));
    body.push(px(-9, -18, 18, 3, trim, 0.9));
    body.push(px(-9, -18, 18, 1, mix(trim, C.cream, 0.6), 0.8));
    body.push(px(-1, -31, 2, 1, C.gold));
    body.push(px(-1, -30, 1, 1, C.bloomCore));
    // a little sparkle on the bodice
    body.push(px(4, -25, 1, 1, C.cream, 0.9));
  } else {
    // shirt V, lapels, tie, pocket square, buttons
    body.push(px(-4, -33, 8, 12, C.cream));
    body.push(px(-8, -32, 5, 12, wear));
    body.push(px(3, -32, 5, 12, wear));
    body.push(px(-7, -32, 2, 10, wearDark));
    body.push(px(5, -32, 2, 10, wearDark));
    body.push(px(-2, -32, 4, 3, trim));
    body.push(px(-1, -30, 2, 9, trim));
    body.push(px(-1, -30, 1, 9, mix(trim, C.plumDeep, 0.7), 0.6));
    body.push(px(4, -26, 3, 2, C.cream, 0.9));
    body.push(px(-1, -16, 2, 2, C.gold, 0.8));
  }

  // ---- arms forward onto the table, one of them holding a glass
  for (const side of [-1, 1]) {
    const sx = side * 9;
    body.push(px(sx - (side > 0 ? 0 : 4), -30, 4, 16, wearDark));
    body.push(px(sx - (side > 0 ? 0 : 4), -30, 2, 16, wear));
    body.push(px(sx - (side > 0 ? 0 : 4), -15, 4, 4, skin));
    body.push(px(sx - (side > 0 ? 0 : 4), -15, 4, 1, skinShade, 0.7));
  }
  if (glass) {
    const gx = facing * 9;
    body.push(...ellipse(u(gx), u(-20), u(2.6), u(3.4), C.glass, 0.9));
    body.push(...ellipse(u(gx), u(-19), u(2), u(2.4), C.petal, 0.55));
    body.push(px(gx - 1, -17, 1, 4, C.glassDark, 0.9));
    body.push(...ellipse(u(gx), u(-13), u(2.4), u(1), C.glassDark, 0.8));
    body.push(px(gx - 2, -22, 1, 2, C.cream, 0.8));
  }
  // neck
  body.push(px(-3, -38, 6, 6, skinShade));
  body.push(px(-3, -38, 4, 6, mix(skin, skinShade, 0.5)));

  // ================= head, origin at the chin =================
  for (let y = -15; y < 0; y++) {
    let w = 14;
    if (y > -5) w = 14 - Math.round(((y + 5) / 5) * 5);
    if (y > -2) w = 9 - Math.round(((y + 2) / 2) * 3);
    const half = Math.round(w / 2);
    head.push(px(-half, y, w, 2, skin));
    head.push(px(half - 2, y, 2, 2, skinShade));
  }
  // ears, with an earring on the dressed guests
  head.push(px(-8, -9, 2, 4, skinShade), px(6, -9, 2, 4, skinShade));
  if (dress) {
    head.push(px(-8, -5, 2, 2, C.gold), px(6, -5, 2, 2, C.goldDark));
  }
  // brows
  head.push(px(-6 + facing, -12, 3, 1, hairDark), px(2 + facing, -12, 3, 1, hairDark));
  // eyes: white, iris, pupil, catch-light — turned towards the couple
  for (const e of [-6, 2]) {
    const ex = e + facing;
    head.push(px(ex, -10, 3, 3, C.eyeWhite));
    head.push(px(ex + (facing > 0 ? 1 : 0), -10, 2, 3, C.iris));
    head.push(px(ex + (facing > 0 ? 1 : 0), -9, 1, 2, C.pupil));
    head.push(px(ex + (facing > 0 ? 2 : 0), -10, 1, 1, C.shine));
    head.push(px(ex, -11, 3, 1, hairDark, 0.7));
  }
  // nose, mouth, blush, chin
  head.push(px(facing, -6, 1, 2, skinShade));
  head.push(px(-2, -4, 4, 1, C.lip));
  head.push(px(-1, -3, 2, 1, C.lipDark));
  head.push(px(-3 + facing, -5, 1, 1, C.lip, 0.8));
  head.push(px(-7, -7, 2, 2, C.blush, 0.45), px(5, -7, 2, 2, C.blush, 0.45));
  head.push(px(-3, -1, 6, 1, skinShade, 0.5));

  // ---- hair: four silhouettes, each with a sheen
  head.push(px(-8, -18, 16, 5, hair));
  head.push(px(-8, -18, 16, 2, hairDark));
  head.push(px(-6 + facing * 2, -17, 5, 1, hairLit, 0.8));
  if (r2 > 0.72) {
    // long, over the shoulders
    head.push(px(-9, -15, 3, 20, hair));
    head.push(px(6, -15, 3, 20, hair));
    head.push(px(-9, -2, 3, 6, hairDark));
    head.push(px(6, -2, 3, 6, hairDark));
  } else if (r2 > 0.48) {
    // up in a bun, with a flower in it
    head.push(...ellipse(u(0), u(-21), u(5), u(4), hair));
    head.push(...ellipse(u(-1), u(-22), u(2.4), u(1.8), hairLit, 0.7));
    head.push(px(-8, -14, 2, 5, hair), px(6, -14, 2, 5, hair));
    head.push(...ellipse(u(6), u(-18), u(2.6), u(2.2), C.petal));
    head.push(px(6, -18, 1, 1, C.bloomCore));
  } else if (r2 > 0.24) {
    // bob
    head.push(px(-9, -16, 3, 12, hair));
    head.push(px(6, -16, 3, 12, hair));
    head.push(px(-9, -5, 3, 2, hairDark), px(6, -5, 3, 2, hairDark));
  } else {
    // short, parted on the side they face
    head.push(px(-8, -14, 2, 4, hair), px(6, -14, 2, 4, hair));
    head.push(px(-6 + facing * 3, -19, 6, 2, hairDark));
    head.push(px(-8, -13, 3, 2, hairDark, 0.6));
  }
  return { body, head, headY: -38 * cs };
}

/* ------------------------------------------------------------------ *
 * Guest table
 *
 * Built around the point where the front of the cloth meets the floor.
 * The cloth is a cylinder with an elliptical top and an elliptical hem —
 * that is what sells "round table" from a low angle. Everything scales
 * off `s`, so the far tables are the same object, smaller.
 * ------------------------------------------------------------------ */
export function createTable(x: number, y: number, s = 1, seed = 1, num = '1'): Prop {
  const view = new Container();
  view.position.set(Math.round(x), Math.round(y));

  const rx = 86 * s;
  const ryTop = 25 * s;
  const ryHem = 13 * s;
  const drop = 44 * s;
  const hemY = -ryHem;
  const topY = hemY - drop;

  const back: Rect[] = [];
  const front: Rect[] = [];

  // ---- floor shadow
  back.push(...ellipse(0, -4 * s, rx * 1.3, 20 * s, C.floorDark, 0.22));
  back.push(...ellipse(0, -4 * s, rx, 13 * s, C.floorDark, 0.18));

  // ---- chairs, two behind and one each side, with a guest in every one
  // The side pair sits further out than the cloth's edge — at the rim the
  // tablecloth is drawn over them and swallows everything but a shoulder.
  const seats: Array<[number, number, number, number]> = [
    [-rx * 0.44, topY + 14 * s, s * 0.92, 1],
    [rx * 0.44, topY + 14 * s, s * 0.92, 1],
    [-rx * 1.2, topY + 54 * s, s, 0],
    [rx * 1.2, topY + 54 * s, s, 0],
  ];
  const heads: Array<{ c: Container; baseY: number; phase: number }> = [];
  for (let i = 0; i < seats.length; i++) {
    const [cx, cy, cs, tone] = seats[i];
    back.push(...chair(cx, cy, cs, tone));
    const seatY = cy - 26 * cs;
    // everyone turns towards the couple in the middle of the room
    const facing = x + cx < 640 ? 1 : -1;
    // Colour choices need to spread between neighbours, so each seat gets a
    // seed a long way from its neighbour's rather than a small increment.
    const gs = cs * 1.12;
    const g = guestRects(seed * 7.13 + i * 31.7, gs, facing, (26 * cs) / gs);
    back.push(
      ...g.body.map(
        (r) => [r[0] + Math.round(cx), r[1] + Math.round(seatY), r[2], r[3], r[4], r[5]] as Rect,
      ),
    );
    const hc = new Container();
    const hy = Math.round(seatY + g.headY);
    hc.position.set(Math.round(cx), hy);
    hc.addChild(shape(g.head));
    heads.push({ c: hc, baseY: hy, phase: rand(seed * 5.3 + i) });
  }

  // ---- cloth: body first, then the top, so the hem curve shows
  for (let px = -Math.round(rx); px <= Math.round(rx); px++) {
    const k = px / rx;
    const bottom = hemY + ryHem * Math.sqrt(Math.max(0, 1 - k * k));
    const top = topY - ryTop * 0.2;
    const edge = Math.abs(k);
    let color: number = C.cloth;
    if (edge > 0.88) color = C.clothDeep;
    else if (edge > 0.64) color = C.clothShade;
    front.push([Math.round(px), Math.round(top), 1, Math.round(bottom - top), color]);
  }

  // drape folds
  const folds = Math.max(4, Math.round(8 * s));
  for (let i = 0; i <= folds; i++) {
    const k = -1 + (i / folds) * 2 + (rand(seed * 3.1 + i) - 0.5) * 0.05;
    const px = k * rx * 0.95;
    const bottom = hemY + ryHem * Math.sqrt(Math.max(0, 1 - (px / rx) * (px / rx)));
    const fy = topY + ryTop * 0.45;
    const h = bottom - fy;
    if (h <= 0) continue;
    front.push([Math.round(px), Math.round(fy), Math.max(1, Math.round(2 * s)), Math.round(h), C.clothFold, 0.4]);
    front.push([Math.round(px + 2 * s), Math.round(fy), Math.max(1, Math.round(1 * s)), Math.round(h), C.cream, 0.3]);
  }

  // hem shadow and rim
  for (let px = -Math.round(rx); px <= Math.round(rx); px++) {
    const k = px / rx;
    const bottom = hemY + ryHem * Math.sqrt(Math.max(0, 1 - k * k));
    front.push([Math.round(px), Math.round(bottom - 8 * s), 1, Math.round(7 * s), C.clothDeep, 0.5]);
    front.push([Math.round(px), Math.round(bottom - 2 * s), 1, Math.round(2 * s), C.clothRim, 0.65]);
  }

  // ---- table top
  front.push(...ellipse(0, topY, rx, ryTop, C.clothShade));
  front.push(...ellipse(0, topY - 1 * s, rx * 0.96, ryTop * 0.9, C.cloth));
  front.push(...ellipse(0, topY - 3 * s, rx * 0.62, ryTop * 0.46, C.cream, 0.45));
  front.push(
    ...ellipse(0, topY, rx, ryTop, C.cream, 0.5).filter((r) => r[1] > topY + ryTop * 0.4),
  );

  // the top overhangs the skirt, so drop a shadow just under the front rim
  for (let px = -Math.round(rx * 0.99); px <= Math.round(rx * 0.99); px++) {
    const k = px / rx;
    const edgeY = topY + ryTop * Math.sqrt(Math.max(0, 1 - k * k));
    front.push([Math.round(px), Math.round(edgeY), 1, Math.round(4 * s), C.clothDeep, 0.45]);
  }

  // ---- place settings
  const settings = [-0.72, -0.26, 0.26, 0.72];
  for (let i = 0; i < settings.length; i++) {
    const k = settings[i];
    const px = k * rx * 0.82;
    const py = topY + ryTop * 0.58 * Math.sqrt(Math.max(0, 1 - k * k)) + 3 * s;
    // charger plate, plate, folded napkin
    front.push(...ellipse(px, py, 13 * s, 5 * s, C.plateRim));
    front.push(...ellipse(px, py - 1 * s, 11 * s, 4 * s, C.plate));
    front.push(...ellipse(px, py - 1.5 * s, 6 * s, 2 * s, C.petalLight, 0.9));
    front.push([Math.round(px - 2 * s), Math.round(py - 3 * s), Math.round(4 * s), Math.round(3 * s), C.petal]);
    // cutlery
    front.push([Math.round(px - 15 * s), Math.round(py - 4 * s), Math.max(1, Math.round(1.5 * s)), Math.round(7 * s), C.glassDark]);
    front.push([Math.round(px + 14 * s), Math.round(py - 4 * s), Math.max(1, Math.round(1.5 * s)), Math.round(7 * s), C.glassDark]);
    // glass behind
    const gx = px + 9 * s;
    const gy = py - 12 * s;
    front.push([Math.round(gx - 1 * s), Math.round(gy + 2 * s), Math.max(1, Math.round(2 * s)), Math.round(7 * s), C.glassDark, 0.85]);
    front.push(...ellipse(gx, gy + 8 * s, 4 * s, 1.6 * s, C.glassDark, 0.7));
    front.push(...ellipse(gx, gy, 4.5 * s, 6 * s, C.glass, 0.9));
    front.push(...ellipse(gx, gy + 1 * s, 3 * s, 3.6 * s, C.petal, 0.45));
    front.push(...ellipse(gx - 1.4 * s, gy - 1.6 * s, 1.4 * s, 2.2 * s, C.cream, 0.85));
  }

  // ---- centrepiece: vase, blooms, candles, table number
  const cy = topY - 2 * s;
  front.push(...ellipse(0, cy + 2 * s, 15 * s, 5 * s, C.clothFold, 0.45));
  front.push(...ellipse(0, cy - 9 * s, 10 * s, 13 * s, C.vaseShade));
  front.push(...ellipse(-1.5 * s, cy - 10 * s, 7 * s, 11 * s, C.vase));
  front.push(...ellipse(-3.5 * s, cy - 13 * s, 2.2 * s, 4.5 * s, C.cream, 0.8));
  front.push(...ellipse(0, cy - 20 * s, 11 * s, 4 * s, C.vaseShade));
  front.push(...ellipse(0, cy - 21 * s, 9 * s, 3 * s, C.vase));

  const spots: Array<[number, number, number, 'pink' | 'blush' | 'white' | 'cream']> = [
    [-13 * s, -32 * s, 10 * s, 'pink'],
    [12 * s, -30 * s, 9 * s, 'blush'],
    [0, -42 * s, 11 * s, 'white'],
    [-5 * s, -25 * s, 8 * s, 'blush'],
    [8 * s, -40 * s, 8 * s, 'pink'],
  ];
  for (const [bx, by] of spots) {
    front.push(...leaf(bx * 0.55, cy + by * 0.55, 20 * s, Math.atan2(by, bx || 0.01) + Math.PI, true));
  }
  for (const [bx, by, br, tone] of spots) {
    front.push(...flower(bx, cy + by, br, tone, rand(seed + br) * 3));
  }
  front.push(...bud(-17 * s, cy - 22 * s, 5.5 * s, 'blush'));
  front.push(...bud(17 * s, cy - 20 * s, 5.5 * s, 'pink'));

  // candles
  for (const cxx of [-34 * s, 34 * s]) {
    front.push(...ellipse(cxx, cy + 1 * s, 7 * s, 2.6 * s, C.clothFold, 0.45));
    front.push(...ellipse(cxx, cy, 6 * s, 2.4 * s, C.plateRim));
    front.push([Math.round(cxx - 3 * s), Math.round(cy - 26 * s), Math.round(6 * s), Math.round(26 * s), C.waxShade]);
    front.push([Math.round(cxx - 3 * s), Math.round(cy - 26 * s), Math.round(4 * s), Math.round(26 * s), C.wax]);
    front.push(...ellipse(cxx, cy - 26 * s, 3 * s, 1.8 * s, C.cream));
    front.push([Math.round(cxx - 0.5 * s), Math.round(cy - 30 * s), Math.max(1, Math.round(1.4 * s)), Math.round(4 * s), C.plumDeep]);
  }

  // table number card, leaning behind the near rim
  const cardX = Math.round(rx * 0.46);
  const cardY = Math.round(cy - 4 * s);
  const cw = Math.round(20 * s);
  const ch = Math.round(24 * s);
  front.push([cardX - cw / 2, cardY - ch, cw, ch, C.goldDark]);
  front.push([cardX - cw / 2 + 1, cardY - ch + 1, cw - 2, ch - 2, C.cream]);
  front.push([cardX - cw / 2 + 1, cardY - ch + 1, cw - 2, Math.max(1, Math.round(2 * s)), C.gold, 0.6]);
  const u = Math.max(1, Math.round(3 * s));
  front.push(
    ...sprite(DIGITS[num] ?? DIGITS['1'], cardX - Math.round(1.5 * u), cardY - ch / 2 - Math.round(2.5 * u), { n: C.plumDeep }, u),
  );

  view.addChild(shape(back));
  for (const h of heads) view.addChild(h.c);
  view.addChild(shape(front));

  // ---- flames on top, flickering
  const flames: Graphics[] = [];
  for (const cxx of [-34 * s, 34 * s]) {
    const g = shape([
      ...ellipse(0, 0, 6 * s, 9 * s, C.flame, 0.22),
      ...ellipse(0, 0, 3.4 * s, 6 * s, C.flame),
      ...ellipse(0, 1 * s, 1.8 * s, 3.4 * s, C.flameCore),
      ...ellipse(0, -2 * s, 0.9 * s, 1.6 * s, C.cream),
    ]);
    g.position.set(Math.round(cxx), Math.round(cy - 32 * s));
    flames.push(g);
    view.addChild(g);
  }

  const phase = rand(seed * 7.7);

  return {
    view,
    update(t: number) {
      // the table itself never moves; the guests nod along and the candles
      // flicker
      for (const h of heads) {
        const w = Math.sin(t * 2.1 + h.phase * 6.3);
        h.c.y = h.baseY - Math.round(Math.abs(Math.sin(t * 3.2 + h.phase * 6)) * 1.6);
        h.c.rotation = w * 0.07;
      }
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const w = wave(t * 2.4, 1, phase + i * 0.37);
        f.scale.set(1 + w * 0.08, 1 + w * 0.18);
        f.alpha = 0.85 + w * 0.15;
        f.x = Math.round((i === 0 ? -34 : 34) * s + w * 1.2 * s);
      }
    },
  };
}
