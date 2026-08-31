import { Container, Graphics } from 'pixi.js';
import { C } from './palette';
import { ellipse, hop, limb, mix, redraw, Rect, scaleRects, shape, wave } from './px';

export interface Dancer {
  view: Container;
  update: (t: number) => void;
}

/* ==================================================================== *
 * The bride.
 *
 * Origin is on the floor between her feet, y grows downward, so she can
 * be dropped on any floor line. She stands 116px tall — about 90% of a
 * speaker stack — which puts her head at 21px. Every feature is drawn for
 * that budget: a 4x4 eye with one pixel of pupil and one of catch-light,
 * a one-pixel nose. Detail beyond that has nowhere to land.
 *
 * Landmarks in this local space:
 *   floor 0 | hem -5 | hip -56 | waist -62 | shoulder -84 | chin -92
 *   crown -112 | tiara -116
 *
 * The dance, taken from the clip: hips lead the weight shift, torso and
 * head follow a fraction of a beat behind, both forearms sweep across her
 * together and swap which one reaches out, and the gown, hair and veil
 * trail after the turn. In a floor-length dress the footwork is hidden,
 * so the skirt swing carries it instead. Arms are rebuilt every frame
 * from continuously moving angles — smooth motion, square pixels.
 * ==================================================================== */

/**
 * Overall size. The art below is authored at 1, then re-rasterised
 * through scaleRects, so changing this gives a bigger sprite rather than
 * a scaled-up blurry one.
 */
const S = 1.1;

const SHOULDER_Y = -84;
const SHOULDER_X = 10;
const WAIST_Y = -62;
const CHIN_Y = -92;
const CY = Math.round(CHIN_Y * S);
const WY = Math.round(WAIST_Y * S);

/* ------------------------------------------------------------------ *
 * Head
 * ------------------------------------------------------------------ */

function faceRects(): Rect[] {
  const out: Rect[] = [];
  // head shape, tapering to the chin
  // Rows are 2px tall and overlap by one: the head rotates, and a stack of
  // 1px rows pulls apart into hairline gaps when it does.
  for (let y = -20; y < 0; y++) {
    let w = 16;
    if (y > -7) w = 16 - Math.round(((y + 7) / 7) * 5);
    if (y > -3) w = 11 - Math.round(((y + 3) / 3) * 4);
    const half = Math.round(w / 2);
    const h = y === -1 ? 1 : 2;
    out.push([-half, y, w, h, C.skin]);
    out.push([half - 2, y, 2, h, C.skinShade]);
  }
  out.push([-5, -18, 7, 1, C.skinLit, 0.5]);
  // ears with a pearl
  out.push([-9, -11, 2, 4, C.skinShade], [7, -11, 2, 4, C.skinDeep2]);
  out.push([-9, -7, 2, 2, C.gold], [7, -7, 2, 2, C.goldDark]);
  // brows
  out.push([-7, -14, 4, 1, C.brow], [3, -14, 4, 1, C.brow]);
  // eyes: 4x4 with a pupil, a catch-light and a lash line
  for (const flip of [false, true]) {
    const x = flip ? 3 : -7;
    out.push([x, -12, 4, 1, C.lash]);
    out.push([x, -11, 4, 4, C.eyeWhite]);
    out.push([flip ? x : x + 1, -11, 3, 4, C.iris]);
    out.push([flip ? x + 1 : x + 1, -10, 2, 2, C.pupil]);
    out.push([flip ? x + 2 : x + 1, -11, 1, 1, C.shine]);
    out.push([x, -7, 4, 1, C.skinShade]);
  }
  // nose and a small smile
  out.push([0, -6, 1, 1, C.skinShade]);
  out.push([-2, -4, 4, 1, C.lip]);
  out.push([-1, -3, 2, 1, C.lipDark]);
  out.push([-3, -5, 1, 1, C.lipLight], [2, -5, 1, 1, C.lipLight]);
  // blush and jaw
  out.push([-8, -7, 3, 2, C.blush, 0.45], [5, -7, 3, 2, C.blush, 0.45]);
  out.push([-3, -1, 6, 1, C.skinShade, 0.5]);
  return out;
}

/** Crown and fringe. */
function hairFrontRects(): Rect[] {
  const out: Rect[] = [];
  for (let y = -23; y < -14; y++) {
    const t = (y + 23) / 9;
    const w = Math.round(10 + t * 10);
    const half = Math.round(w / 2);
    out.push([-half, y, w, 2, C.hairInk]);
  }
  out.push([-10, -16, 20, 3, C.hairInk]);
  out.push([-6, -21, 5, 1, C.hairCool], [0, -22, 4, 1, C.hairCool]);
  out.push([-5, -21, 2, 1, C.hairSheen]);
  // fringe: a swept curtain with a couple of strand tips
  const fringe: Array<[number, number]> = [
    [-10, 7], [-8, 6], [-6, 5], [-4, 4], [-2, 4], [0, 5], [2, 6], [4, 7], [6, 7], [8, 6],
  ];
  for (const [x, len] of fringe) {
    out.push([x, -16, 2, len, C.hairInk]);
    out.push([x, -16, 1, len - 1, C.hairDark]);
  }
  out.push([-11, -12, 2, 5, C.hairInk], [9, -12, 2, 6, C.hairInk]);
  // bloom pinned at the temple
  out.push(...ellipse(-10, -14, 3.2, 3, C.petal));
  out.push(...ellipse(-10, -15, 1.8, 1.6, C.petalLight));
  out.push([-10, -14, 1, 1, C.bloomCore]);
  return out;
}

function tiaraRects(): Rect[] {
  return [
    [-8, -24, 16, 2, C.goldDark],
    [-8, -24, 16, 1, C.gold],
    [-6, -26, 2, 2, C.gold],
    [-1, -27, 2, 3, C.gold],
    [4, -26, 2, 2, C.gold],
    [-1, -27, 1, 1, C.spark],
    [-6, -25, 1, 1, C.petal],
    [5, -25, 1, 1, C.petal],
  ];
}

/** The mass of hair behind her. */
function hairBackRects(): Rect[] {
  const out: Rect[] = [];
  out.push(...ellipse(0, -14, 12, 9, C.hairInk));
  for (let y = -16; y < 26; y++) {
    const t = (y + 16) / 42;
    const w = 21 + Math.round(Math.sin(t * Math.PI * 0.9) * 7);
    const half = Math.round(w / 2);
    const shift = Math.round(Math.sin(y / 13) * 2);
    out.push([-half + shift, y, w, 2, C.hairInk]);
    if (y % 7 === 0) out.push([-half + shift + 2, y, 3, 1, C.hairCool, 0.45]);
  }
  for (let i = 0; i < 10; i++) {
    const y = 26 + i;
    const w = Math.max(2, 24 - i * 2);
    const half = Math.round(w / 2);
    out.push([-half + Math.round(Math.sin(y / 13) * 2), y, w, 2, C.hairInk]);
  }
  return out;
}

/** The two locks over her shoulders — their own layer, in front of the dress. */
function hairSideRects(): Rect[] {
  const out: Rect[] = [];
  for (const dir of [-1, 1]) {
    for (let y = -10; y < 22; y++) {
      const wob = Math.sin((y + (dir > 0 ? 14 : 0)) / 10) * 2;
      const x = dir * 10 + wob;
      const w = y > 16 ? Math.max(1, 5 - (y - 16)) : 5;
      out.push([Math.round(x - w / 2), y, w, 2, C.hairInk]);
      out.push([Math.round(x - w / 2), y, 1, 2, C.hairDark]);
      if (y % 8 === 0) out.push([Math.round(x - 1), y, 2, 1, C.hairCool, 0.5]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Gown
 * ------------------------------------------------------------------ */

function bodiceRects(): Rect[] {
  const out: Rect[] = [];
  // neck, collar bones, shoulders
  out.push([-3, -92, 6, 8, C.skin], [1, -92, 2, 8, C.skinShade]);
  out.push(...ellipse(0, -84, 12, 4, C.skin));
  out.push(...ellipse(0, -85, 10, 3, C.skinLit, 0.35));

  for (let y = -84; y < WAIST_Y; y++) {
    const t = (y + 84) / 22;
    const w = Math.round(21 - t * 5);
    const half = Math.round(w / 2);
    const h = y === WAIST_Y - 1 ? 1 : 2;
    out.push([-half, y, w, h, C.dress]);
    out.push([half - 3, y, 3, h, C.dressShade]);
    out.push([-half, y, 1, h, C.dressShade, 0.6]);
  }
  // sweetheart neckline
  out.push(...ellipse(-5, -84, 5, 3, C.skin));
  out.push(...ellipse(5, -84, 5, 3, C.skin));
  out.push([-1, -85, 2, 2, C.dress]);
  out.push(...ellipse(-4, -79, 4, 3, C.dressShade, 0.5));
  out.push(...ellipse(4, -79, 4, 3, C.dressShade, 0.7));
  // lace on the bodice
  for (let y = -82; y < -66; y += 3) {
    for (let x = -8; x < 8; x += 3) {
      out.push([x + ((y / 3) % 2 ? 1 : 0), y, 1, 1, C.lace, 0.55]);
    }
  }
  // sash and a small bow
  out.push([-9, -65, 18, 3, C.petal]);
  out.push([-9, -65, 18, 1, C.petalLight]);
  out.push([-9, -63, 18, 1, C.petalDark]);
  out.push(...ellipse(-7, -64, 3, 2, C.petal), ...ellipse(-2, -64, 3, 2, C.petal));
  out.push([-5, -64, 1, 1, C.petalDark]);
  out.push([-6, -62, 2, 5, C.petal], [-3, -62, 2, 4, C.petalDark]);
  return out;
}

/** Floor-length A-line gown: gathers, lace, hem shadow, a little train. */
function skirtRects(): Rect[] {
  const out: Rect[] = [];
  const top = WAIST_Y;
  const hem = -5;
  const span = hem - top;
  const halfAt = (y: number) => 9 + Math.pow((y - top) / span, 1.28) * 24;

  // The gown swings, so its rows overlap by a pixel too.
  for (let y = top; y < hem; y++) {
    const half = Math.round(halfAt(y));
    const h = y === hem - 1 ? 1 : 2;
    const sw = Math.max(1, Math.round(half * 0.26));
    out.push([-half, y, half * 2, h, C.dress]);
    out.push([half - sw, y, sw, h, C.dressShade]);
    out.push([-half, y, 1, h, C.dressShade, 0.7]);
  }
  // gathers: soft vertical bands, wider towards the hem
  const hemMax = halfAt(hem - 1);
  for (const k of [-0.72, -0.36, 0.12, 0.5, 0.82]) {
    const bx = k * hemMax * 0.84;
    for (let y = top + 6; y < hem; y++) {
      const half = halfAt(y);
      if (Math.abs(bx) > half - 1) continue;
      const w = Math.max(2, Math.round(2 + (y - top) / 14));
      out.push([Math.round(bx - w / 2), y, w, 2, C.dressShade, 0.16]);
      out.push([Math.round(bx + w / 2), y, 1, 2, C.cream, 0.2]);
    }
  }
  // No lace scatter down here: at this size a dotted grid on a curved
  // skirt lines up into diagonal streaks rather than reading as lace.
  // hem: shadow, lace rim, tulle
  const hemHalf = Math.round(halfAt(hem - 1));
  for (let y = hem - 5; y < hem; y++) {
    const half = Math.round(halfAt(y));
    out.push([-half, y, half * 2, 2, C.dressDeep, 0.35]);
  }
  out.push([-hemHalf, hem - 2, hemHalf * 2, 2, C.lace]);
  out.push([-hemHalf - 2, hem, hemHalf * 2 + 4, 3, C.veil, 0.45]);
  // train pooling behind her feet
  out.push(...ellipse(2, hem + 2, hemHalf * 0.9, 4, C.dressShade, 0.8));
  out.push(...ellipse(2, hem + 1, hemHalf * 0.8, 3, C.dress));
  return out;
}

/* ------------------------------------------------------------------ *
 * Arms, rebuilt each frame
 * ------------------------------------------------------------------ */

function handRects(x: number, y: number, angle: number): Rect[] {
  const dx = -Math.sin(angle);
  const dy = Math.cos(angle);
  return [
    ...ellipse(x + dx * 1.5, y + dy * 1.5, 2.6, 2.8, C.skin),
    ...ellipse(x + dx * 3, y + dy * 3, 1.8, 1.8, C.skin),
    ...ellipse(x + dx * 3 - dy * 1.4, y + dy * 3 + dx * 1.4, 1.2, 1.2, C.skinShade),
  ];
}

function armRects(side: number, upperA: number, foreA: number): Rect[] {
  const sx = SHOULDER_X * side;
  const sy = SHOULDER_Y + 2;
  const upper = limb(sx, sy, upperA, 15, 4, C.skin);
  const fore = limb(upper.x, upper.y, foreA, 14, 4, C.skin);
  const out: Rect[] = [];
  // a darker pass one pixel wider, so skin does not bleed into the room
  out.push(
    ...limb(sx, sy, upperA, 15, 5, C.skinDeep2).rects.map(
      (r) => [r[0], r[1], r[2], r[3], r[4], 0.4] as Rect,
    ),
    ...limb(upper.x, upper.y, foreA, 14, 5, C.skinDeep2).rects.map(
      (r) => [r[0], r[1], r[2], r[3], r[4], 0.4] as Rect,
    ),
  );
  out.push(...ellipse(sx, sy, 3, 3, C.skin));
  out.push(...upper.rects);
  out.push(...ellipse(upper.x, upper.y, 2.4, 2.4, C.skin));
  out.push(...fore.rects);
  out.push(...handRects(fore.x, fore.y, foreA));
  return out;
}

/* ------------------------------------------------------------------ *
 * Rig
 * ------------------------------------------------------------------ */
export function createBride(): Dancer {
  const view = new Container();

  const shadow = shape(scaleRects([...ellipse(0, -2, 30, 7, C.floorDark, 0.3)], S));

  const veil = new Container();
  veil.position.set(0, CY);
  veil.addChild(
    shape(scaleRects([
      ...ellipse(0, -19, 12, 5, C.veil, 0.5),
      ...ellipse(0, 8, 19, 30, C.veil, 0.22),
      ...ellipse(0, 16, 23, 26, C.veil, 0.16),
      ...ellipse(0, 8, 19, 30, C.cream, 0.3).filter((r) => r[1] > 26),
      ...ellipse(0, 16, 23, 26, C.cream, 0.2).filter((r) => r[1] > 34),
    ], S)),
  );

  const hairBack = new Container();
  hairBack.position.set(0, CY);
  hairBack.addChild(shape(scaleRects(hairBackRects(), S)));

  const hips = new Container();

  const skirt = new Container();
  skirt.position.set(0, WY);
  skirt.addChild(
    shape(
      scaleRects(
        skirtRects().map((r) => [r[0], r[1] - WAIST_Y, r[2], r[3], r[4], r[5]] as Rect),
        S,
      ),
    ),
  );

  const torso = new Container();
  torso.addChild(shape(scaleRects(bodiceRects(), S)));

  const hairSide = new Container();
  hairSide.position.set(0, CY);
  hairSide.addChild(shape(scaleRects(hairSideRects(), S)));

  const head = new Container();
  head.position.set(0, CY);
  head.addChild(
    shape(scaleRects(faceRects(), S)),
    shape(scaleRects(hairFrontRects(), S)),
    shape(scaleRects(tiaraRects(), S)),
  );

  const armFar = new Graphics();
  const armNear = new Graphics();

  hips.addChild(skirt, torso);
  view.addChild(shadow, veil, hairBack, hips, hairSide, armFar, armNear, head);

  let armOrder = false;

  return {
    view,
    update(t: number) {
      // one full weight shift every two beats; everything hangs off it
      const s = wave(t, 2);
      const lag = wave(t, 2, -0.06);
      const lag2 = wave(t, 2, -0.12);
      const b = hop(t);
      const k = (lag + 1) / 2;

      hips.x = Math.round(s * 3 * S);
      hips.y = -Math.round(b * 2 * S);
      hips.rotation = s * 0.02;

      // the gown carries the footwork: it swings wider than she does and
      // arrives late
      skirt.rotation = -lag2 * 0.09;
      skirt.scale.x = 1 + Math.abs(lag2) * 0.06;

      // torso counter-rotates and narrows at the extremes, which reads as
      // her shoulders turning without a second set of art
      torso.rotation = -lag * 0.06;
      torso.x = Math.round(-lag * 1);
      torso.scale.x = 1 - Math.abs(lag) * 0.07;

      head.rotation = -lag2 * 0.08;
      head.x = Math.round((s * 3 - lag2 * 2) * S);
      head.y = CY - Math.round(b * 2 * S);

      hairBack.x = Math.round((s * 3 - lag2 * 3) * S);
      hairBack.y = CY - Math.round(b * 2 * S);
      hairBack.rotation = -lag2 * 0.1;

      hairSide.x = Math.round((s * 3 - lag2 * 2) * S);
      hairSide.y = CY - Math.round(b * 2 * S);
      hairSide.rotation = -lag2 * 0.08;

      veil.x = Math.round((s * 3 - lag2 * 4) * S);
      veil.y = CY - Math.round(b * 2 * S);
      veil.rotation = -lag2 * 0.06;

      // both forearms sweep across her together, swapping which one reaches
      redraw(armFar, scaleRects(armRects(-1, 0.55 - k * 0.1, 1.8 - k * 3.82), S));
      redraw(armNear, scaleRects(armRects(1, -0.45 - k * 0.1, 2.02 - k * 3.82), S));
      const ax = Math.round(s * 2 * S);
      const ay = -Math.round(b * 2 * S);
      armFar.position.set(ax, ay);
      armNear.position.set(ax, ay);

      const frontIsFar = k > 0.5;
      if (frontIsFar !== armOrder) {
        armOrder = frontIsFar;
        view.addChild(frontIsFar ? armFar : armNear);
        view.addChild(head);
      }

      shadow.scale.x = 1 - b * 0.05;
    },
  };
}
