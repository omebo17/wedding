import { Container, Graphics } from 'pixi.js';
import { C } from './palette';
import { ellipse, hop, limb, mix, redraw, Rect, scaleRects, shape, wave } from './px';
import type { Dancer } from './bride';

/* ==================================================================== *
 * The groom.
 *
 * Same construction as the bride so they read as a pair: origin on the
 * floor between his feet, y downward. He stands 119px — three taller than
 * her — and is built about ten kilos heavier: a wider chest, a belly that
 * pushes the jacket out, a fuller face and a thicker neck. Same dance,
 * same clock, in step with her.
 *
 * Landmarks in this local space:
 *   floor 0 | ankle -6 | knee -30 | hip -56 | waist -60 | shoulder -88
 *   chin -97 | skull top -117 | hair top -119
 * ==================================================================== */

/** Overall size — see the note in bride.ts. Kept in step with hers. */
const S = 1.1;

const SHOULDER_Y = -92;
const SHOULDER_X = 13;
const HIP_Y = -56;
const HIP_X = 7;
const CHIN_Y = -97;
const CY = Math.round(CHIN_Y * S);

/* ------------------------------------------------------------------ *
 * Head — rounder and wider than hers, with a soft jaw
 * ------------------------------------------------------------------ */
function faceRects(): Rect[] {
  const out: Rect[] = [];

  // Feature rows, so nothing lands on top of anything else:
  //   brows -14 | eyes -12..-8 | nose -7 | mouth -4..-3 | chin -1
  // The beard therefore gets the jaw from -7 down, plus one moustache row
  // at -5, and it is drawn BEFORE the features so they always sit on top.
  const faceW = (y: number) => {
    if (y < -15) return 16;
    if (y > -2) return 15 - Math.round(((y + 2) / 2) * 4);
    if (y > -6) return 18 - Math.round(((y + 6) / 6) * 3);
    return 18;
  };

  // Rows are drawn 2px tall and overlap by one. The head rotates, and a
  // stack of 1px rows pulls apart into hairline gaps when it does.
  for (let y = -20; y < 0; y++) {
    const w = faceW(y);
    const half = Math.round(w / 2);
    const h = y === -1 ? 1 : 2;
    out.push([-half, y, w, h, C.skin]);
    out.push([half - 2, y, 2, h, C.skinShade]);
  }
  out.push([-5, -18, 7, 1, C.skinLit, 0.45]);
  // ears
  out.push([-10, -12, 2, 4, C.skinShade], [8, -12, 2, 4, C.skinDeep2]);

  // beard: jaw sides, then the chin, then a moustache above the mouth
  for (let y = -7; y < 0; y++) {
    const half = Math.round(faceW(y) / 2);
    out.push([-half, y, 3, 1, C.hairInk]);
    out.push([half - 3, y, 3, 1, C.hairInk]);
    if (y >= -2) out.push([-half + 1, y, faceW(y) - 2, 1, C.hairInk]);
  }
  out.push([-4, -5, 3, 1, C.hairInk], [1, -5, 3, 1, C.hairInk]);
  out.push([-9, -6, 2, 1, C.hairCool, 0.5], [7, -6, 2, 1, C.hairCool, 0.5]);
  out.push([-2, -1, 4, 1, C.hairCool, 0.35]);

  // brows: heavier and straighter than hers
  out.push([-8, -14, 5, 2, C.brow], [3, -14, 5, 2, C.brow]);
  // eyes
  for (const flip of [false, true]) {
    const x = flip ? 3 : -7;
    out.push([x, -12, 4, 1, C.lash]);
    out.push([x, -11, 4, 3, C.eyeWhite]);
    out.push([flip ? x : x + 1, -11, 3, 3, C.iris]);
    out.push([x + 1, -10, 2, 2, C.pupil]);
    out.push([flip ? x + 2 : x + 1, -11, 1, 1, C.shine]);
    out.push([x, -8, 4, 1, C.skinShade]);
  }
  // nose and a grin inside the beard
  out.push([0, -7, 2, 1, C.skinShade]);
  out.push([-3, -4, 6, 1, C.lipDark]);
  out.push([-2, -3, 4, 1, C.lip]);
  // full cheeks
  out.push([-9, -9, 3, 2, C.blush, 0.28], [6, -9, 3, 2, C.blush, 0.28]);
  // No neck here: it lives on the torso instead, so it cannot part company
  // with the collar when the head bobs.
  return out;
}

/** Short black hair with a side parting. */
function hairRects(): Rect[] {
  const out: Rect[] = [];
  for (let y = -22; y < -15; y++) {
    const t = (y + 22) / 7;
    const w = Math.round(12 + t * 8);
    const half = Math.round(w / 2);
    out.push([-half, y, w, 2, C.hairInk]);
  }
  out.push([-10, -16, 20, 3, C.hairInk]);
  out.push([-10, -13, 20, 1, C.hairInk]);
  // a soft parting rather than a hard notch
  out.push([-9, -15, 8, 2, C.hairDark, 0.55]);
  out.push([-6, -21, 5, 1, C.hairCool], [0, -21, 4, 1, C.hairSheen, 0.6]);
  // Sideburns stop short of the beard: the two pixels either side stay
  // skin, so the beard reads as a beard rather than as a chinstrap joined
  // to his hair.
  out.push([-10, -14, 2, 3, C.hairInk], [8, -14, 2, 3, C.hairInk]);
  return out;
}

/* ------------------------------------------------------------------ *
 * Suit
 * ------------------------------------------------------------------ */
function jacketRects(): Rect[] {
  const out: Rect[] = [];
  // A short neck on a big man: the shoulders come up close under the jaw,
  // so the body reaches the head rather than the neck stretching to meet
  // the collar. Only three pixels of throat show.
  out.push([-5, -99, 10, 7, C.skin]);
  out.push([2, -99, 3, 7, C.skinShade]);
  out.push([-5, -99, 10, 2, C.skinShade, 0.6]);

  const top = -94;
  const bottom = -54;
  const span = bottom - top;
  for (let y = top; y < bottom; y++) {
    const t = (y - top) / span;
    // broad shoulders, a belly at its fullest around the waistline
    let w = Math.round(30 - t * 3 + Math.sin(Math.pow(t, 0.9) * Math.PI) * 5);
    // round the shoulder line off instead of ending in a hard corner
    if (y === top) w -= 6;
    else if (y === top + 1) w -= 3;
    else if (y === top + 2) w -= 1;
    const half = Math.round(w / 2);
    const h = y === bottom - 1 ? 1 : 2;
    out.push([-half, y, w, h, C.suit]);
    out.push([-half, y, 4, h, C.suitDark]);
    out.push([half - 3, y, 3, h, C.suitDark, 0.8]);
  }
  // shirt panel and lapels
  out.push([-5, -94, 10, 18, C.shirt]);
  out.push([-5, -94, 2, 18, mix(C.shirt, C.dressShade, 0.5)]);
  out.push([-9, -93, 5, 14, C.suit]);
  out.push([4, -93, 5, 14, C.suit]);
  out.push([-8, -92, 1, 12, C.suitDark]);
  out.push([7, -92, 1, 12, C.suitDark]);
  // collar and bow tie
  out.push([-6, -94, 4, 3, C.shirt]);
  out.push([2, -94, 4, 3, C.shirt]);
  out.push([-4, -92, 3, 4, C.shoe], [1, -92, 3, 4, C.shoe]);
  out.push([-1, -91, 2, 2, C.suitDark]);
  // buttoned front, with a crease where the jacket pulls over the belly
  out.push([-1, -70, 2, 2, C.gold]);
  out.push([-13, -68, 11, 1, C.suitDark, 0.5]);
  out.push([2, -68, 11, 1, C.suitDark, 0.5]);
  // boutonniere
  out.push(...ellipse(-10, -87, 2.6, 2.4, C.petal));
  out.push(...ellipse(-10, -88, 1.4, 1.2, C.petalLight));
  out.push([-12, -85, 2, 2, C.leaf]);
  // jacket hem
  out.push([-15, -56, 30, 2, C.suitDark]);
  return out;
}

/** Trousers, then a shoe at the ankle. */
function legRects(side: number, thighA: number, shinA: number, lift: number): Rect[] {
  const hipX = HIP_X * side;
  const thigh = limb(hipX, HIP_Y + 2, thighA, 26, 11, C.suit);
  const shin = limb(thigh.x, thigh.y, shinA, 24 - lift, 9, C.suit);
  const out: Rect[] = [];
  out.push(...thigh.rects);
  out.push(...shin.rects);
  out.push(
    ...limb(hipX, HIP_Y + 2, thighA, 26, 3, C.suitDark).rects.map(
      (r) => [r[0] + (side > 0 ? 4 : -4), r[1], r[2], r[3], r[4], 0.7] as Rect,
    ),
    ...limb(thigh.x, thigh.y, shinA, 24 - lift, 3, C.suitDark).rects.map(
      (r) => [r[0] + (side > 0 ? 3 : -3), r[1], r[2], r[3], r[4], 0.6] as Rect,
    ),
  );
  // turn-up and shoe
  const ax = Math.round(shin.x);
  const ay = Math.round(shin.y);
  out.push([ax - 5, ay - 3, 10, 1, C.suitDark]);
  out.push([ax - 5, ay - 1, 10, 4, C.shoe]);
  out.push([ax + (side > 0 ? 3 : -7), ay - 1, 4, 4, C.shoe]);
  out.push([ax - 5, ay - 1, 10, 1, mix(C.shoe, C.cream, 0.75)]);
  return out;
}

function handRects(x: number, y: number, angle: number): Rect[] {
  const dx = -Math.sin(angle);
  const dy = Math.cos(angle);
  return [
    ...ellipse(x + dx * 1.5, y + dy * 1.5, 2.8, 3, C.skin),
    ...ellipse(x + dx * 3.2, y + dy * 3.2, 2, 2, C.skin),
    ...ellipse(x + dx * 3 - dy * 1.5, y + dy * 3 + dx * 1.5, 1.3, 1.3, C.skinShade),
  ];
}

function armRects(side: number, upperA: number, foreA: number): Rect[] {
  const sx = SHOULDER_X * side;
  const sy = SHOULDER_Y + 3;
  const upper = limb(sx, sy, upperA, 15, 6, C.suit);
  const fore = limb(upper.x, upper.y, foreA, 14, 5, C.suit);
  const out: Rect[] = [];
  out.push(...ellipse(sx, sy, 4, 4, C.suit));
  out.push(...upper.rects);
  out.push(
    ...limb(sx, sy, upperA, 15, 2, C.suitDark).rects.map(
      (r) => [r[0], r[1], r[2], r[3], r[4], 0.6] as Rect,
    ),
  );
  out.push(...ellipse(upper.x, upper.y, 3, 3, C.suit));
  out.push(...fore.rects);
  // shirt cuff, so the hand does not merge into the sleeve
  out.push(...ellipse(fore.x, fore.y, 2.6, 2.6, C.shirt));
  out.push(...handRects(fore.x, fore.y, foreA));
  return out;
}

/* ------------------------------------------------------------------ *
 * Rig — the same clock and the same moves as the bride
 * ------------------------------------------------------------------ */
export function createGroom(): Dancer {
  const view = new Container();

  const shadow = shape(scaleRects([...ellipse(0, -2, 26, 6, C.floorDark, 0.3)], S));

  const hips = new Container();
  const legs = new Graphics();
  const torso = new Container();
  torso.addChild(shape(scaleRects(jacketRects(), S)));

  const head = new Container();
  head.position.set(0, CY);
  head.addChild(shape(scaleRects(faceRects(), S)), shape(scaleRects(hairRects(), S)));

  const armFar = new Graphics();
  const armNear = new Graphics();

  hips.addChild(legs, torso);
  view.addChild(shadow, hips, armFar, armNear, head);

  let armOrder = false;

  return {
    view,
    update(t: number) {
      const s = wave(t, 2);
      const lag = wave(t, 2, -0.06);
      const lag2 = wave(t, 2, -0.12);
      const b = hop(t);
      const k = (lag + 1) / 2;

      hips.x = Math.round(s * 3 * S);
      hips.y = -Math.round(b * 2 * S);
      hips.rotation = s * 0.02;

      // legs lean with the shift; the unweighted heel comes up
      const bend = 0.09 + b * 0.08;
      redraw(
        legs,
        scaleRects(
          [
            ...legRects(-1, 0.05 + s * 0.12, 0.05 + s * 0.12 - bend, Math.max(0, -s) * 3),
            ...legRects(1, -0.05 + s * 0.12, -0.05 + s * 0.12 + bend, Math.max(0, s) * 3),
          ],
          S,
        ),
      );

      torso.rotation = -lag * 0.05;
      torso.x = Math.round(-lag * 1);
      torso.scale.x = 1 - Math.abs(lag) * 0.05;

      head.rotation = -lag2 * 0.07;
      head.x = Math.round((s * 3 - lag2 * 2) * S);
      head.y = CY - Math.round(b * 2 * S);

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
