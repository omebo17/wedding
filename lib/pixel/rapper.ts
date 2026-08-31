import { Container, Graphics } from 'pixi.js';
import { C } from './palette';
import { beatPhase, clip, ellipse, hop, ik, limb, redraw, Rect, wave } from './px';

export interface Dancer {
  view: Container;
  update: (t: number) => void;
}

/* ==================================================================== *
 * The rapper, performing outside on the near bank of the lake.
 *
 * He is seen through the window, so every rect is clipped to the opening
 * before it is drawn: he is part of the view, not part of the room, and
 * without the clip he would spill onto the timber wall.
 *
 * 95px tall — smaller than the couple, because he is the far side of the
 * glass. Origin between his feet, y downward.
 *   floor 0 | ankle -6 | knee -26 | hip -46 | shoulder -70 | chin -78
 *   crown -93
 * ==================================================================== */

const HIP_Y = -46;
const HIP_X = 5;
const SHOULDER_Y = -70;
const SHOULDER_X = 9;
const CHIN_Y = -78;

const THIGH = 20;
const SHIN = 20;
const UPPER = 17;
const FORE = 15;

type P2 = [number, number];

/**
 * The raised arm is driven by joint angles, not by a hand target: the
 * upper arm is pinned pointing straight out from his body and only the
 * forearm swings, up and down around the elbow. Aiming the hand at a
 * point would let the solver move the elbow, which is exactly what this
 * pose must not do.
 *
 * In the limb() convention, -PI/2 points straight out to +x.
 */
const ARM_OUT = -Math.PI / 2;
/** How far the forearm swings either side of straight out, in radians. */
const PUMP = 1.05;

function legRects(side: number, foot: P2, hipDrop: number, bend: number): Rect[] {
  const hip: P2 = [HIP_X * side, HIP_Y + hipDrop];
  const [thighA, shinA] = ik(hip, foot, THIGH, SHIN, bend);
  const thigh = limb(hip[0], hip[1], thighA, THIGH, 9, C.pants);
  const shin = limb(thigh.x, thigh.y, shinA, SHIN, 8, C.pants);
  const out: Rect[] = [];
  out.push(...thigh.rects);
  out.push(...shin.rects);
  out.push(
    ...limb(hip[0], hip[1], thighA, THIGH, 3, C.pantsDark).rects.map(
      (r) => [r[0] + (side > 0 ? 4 : -3), r[1], r[2], r[3], r[4], 0.75] as Rect,
    ),
    ...limb(thigh.x, thigh.y, shinA, SHIN, 3, C.pantsDark).rects.map(
      (r) => [r[0] + (side > 0 ? 3 : -3), r[1], r[2], r[3], r[4], 0.7] as Rect,
    ),
  );
  // cuff and sneaker
  out.push(...ellipse(shin.x, shin.y - 3, 5, 2.6, C.pantsDark));
  out.push(...ellipse(shin.x, shin.y, 5.5, 3.4, C.kicksDark));
  out.push(...ellipse(shin.x - side * 1.5, shin.y - 1, 5, 2.6, C.kicks));
  out.push([Math.round(shin.x - 5), Math.round(shin.y + 1), 10, 1, C.kicksDark]);
  return out;
}

function torsoRects(): Rect[] {
  const out: Rect[] = [];
  // hood bunched behind the neck
  out.push(...ellipse(0, SHOULDER_Y - 1, 12, 6, C.hoodieDark));
  for (let y = SHOULDER_Y; y < HIP_Y + 4; y++) {
    const t = (y - SHOULDER_Y) / (HIP_Y + 4 - SHOULDER_Y);
    const w = Math.round(23 - t * 2);
    const half = Math.round(w / 2);
    const h = y === HIP_Y + 3 ? 1 : 2;
    out.push([-half, y, w, h, C.hoodie]);
    out.push([-half, y, 4, h, C.hoodieDark]);
    out.push([half - 3, y, 3, h, C.hoodieDark, 0.55]);
  }
  // pocket, drawstrings, hem
  out.push([-8, HIP_Y - 6, 16, 6, C.hoodieDark, 0.6]);
  out.push([-3, SHOULDER_Y + 3, 2, 8, C.cream, 0.8], [1, SHOULDER_Y + 3, 2, 7, C.cream, 0.8]);
  out.push([-12, HIP_Y + 2, 24, 3, C.hoodieDark]);
  // rope chain
  out.push([-5, SHOULDER_Y + 3, 3, 2, C.gold]);
  out.push([-2, SHOULDER_Y + 5, 3, 2, C.gold]);
  out.push([2, SHOULDER_Y + 3, 3, 2, C.gold]);
  out.push([-2, SHOULDER_Y + 7, 4, 4, C.goldDark]);
  out.push([-1, SHOULDER_Y + 8, 2, 2, C.gold]);
  return out;
}

function headRects(): Rect[] {
  const out: Rect[] = [];
  for (let y = -15; y < 0; y++) {
    let w = 13;
    if (y > -4) w = 13 - Math.round(((y + 4) / 4) * 4);
    const half = Math.round(w / 2);
    out.push([-half, y, w, 2, C.skinDeep]);
    out.push([half - 2, y, 2, 2, C.skinDeepShade]);
  }
  // shades
  out.push([-7, -11, 14, 4, C.mic]);
  out.push([-6, -11, 4, 1, C.speakerCone, 0.9]);
  out.push([1, -11, 3, 1, C.speakerCone, 0.7]);
  out.push([-1, -10, 2, 2, C.mic]);
  // nose, grin, goatee
  out.push([0, -6, 2, 1, C.skinDeepShade]);
  out.push([-2, -4, 5, 1, C.cream, 0.85]);
  out.push([-3, -3, 7, 2, C.hairInk, 0.8]);
  out.push([-4, -13, 9, 2, C.hairInk]);
  return out;
}

/** Dreads, swayed by `swing`, drawn as chains of short segments. */
function dreadRects(swing: number): Rect[] {
  const out: Rect[] = [];
  const spec: Array<[number, number, number, number]> = [
    [-7, -14, 15, 0.55],
    [-4, -16, 19, 0.3],
    [-1, -17, 21, 0.06],
    [2, -16, 19, -0.28],
    [5, -14, 15, -0.55],
    [-8, -9, 12, 0.95],
    [7, -9, 12, -0.95],
    [-6, -17, 9, 0.15],
    [4, -17, 9, -0.12],
  ];
  for (let i = 0; i < spec.length; i++) {
    const [x0, y0, len, base] = spec[i];
    const a = base + swing * (0.5 + (i % 3) * 0.2);
    let px = x0;
    let py = y0;
    for (let s = 0; s < len; s++) {
      const bend = a + Math.sin(s / 5 + i) * 0.14 + (s / len) * swing * 0.5;
      px += -Math.sin(bend) * 1;
      py += Math.cos(bend) * 1;
      out.push([Math.round(px - 1), Math.round(py), 3, 2, s % 7 === 0 ? C.hairDark : C.hairInk]);
    }
    if (i % 3 === 0) {
      out.push([Math.round(px - 2), Math.round(py), 4, 2, C.goldDark]);
      out.push([Math.round(px - 2), Math.round(py), 4, 1, C.gold]);
    }
  }
  return out;
}

/**
 * An arm from explicit joint angles.
 *
 * The sleeve stops at the elbow and the forearm is bare. At this size a
 * purple forearm coming off a purple upper arm reads as one thick bar —
 * the change of colour at the elbow is what makes the second half of the
 * arm legible at all.
 */
function drawArm(side: number, upperA: number, foreA: number): { rects: Rect[]; hand: P2 } {
  const sh: P2 = [SHOULDER_X * side, SHOULDER_Y + 3];
  const upper = limb(sh[0], sh[1], upperA, UPPER, 7, C.hoodie);
  const fore = limb(upper.x, upper.y, foreA, FORE, 6, C.skinDeep);
  const out: Rect[] = [];
  // shoulder and sleeve
  out.push(...ellipse(sh[0], sh[1], 5.5, 5.5, C.hoodie));
  out.push(...upper.rects);
  out.push(
    ...limb(sh[0], sh[1], upperA, UPPER, 3, C.hoodieDark).rects.map(
      (r) => [r[0], r[1], r[2], r[3], r[4], 0.6] as Rect,
    ),
  );
  // cuff at the elbow, dark, so the break is unmistakable
  out.push(...ellipse(upper.x, upper.y, 5, 5, C.hoodieDark));
  out.push(...ellipse(upper.x, upper.y - 1, 4, 3.4, C.hoodie, 0.8));
  // bare forearm with a shaded underside
  out.push(
    ...limb(upper.x, upper.y, foreA, FORE, 8, C.hairInk).rects.map(
      (r) => [r[0], r[1], r[2], r[3], r[4], 0.35] as Rect,
    ),
  );
  out.push(...fore.rects);
  out.push(
    ...limb(upper.x, upper.y, foreA, FORE, 2, C.skinDeepShade).rects.map(
      (r) => [r[0] + (side > 0 ? 3 : -2), r[1] + 1, r[2], r[3], r[4], 0.7] as Rect,
    ),
  );
  // fist
  out.push(...ellipse(fore.x, fore.y, 4.4, 4.4, C.skinDeep));
  out.push(...ellipse(fore.x, fore.y + 1.5, 3.4, 2.4, C.skinDeepShade, 0.8));
  return { rects: out, hand: [fore.x, fore.y] };
}

function micRects(x: number, y: number): Rect[] {
  return [
    ...ellipse(x, y + 4, 2.2, 4, C.mic),
    ...ellipse(x, y - 1, 3.2, 3.2, C.speakerCone),
    ...ellipse(x, y - 1, 2.2, 2.2, C.mic),
    [Math.round(x - 1), Math.round(y - 3), 2, 1, C.cream, 0.7],
  ];
}

/* ------------------------------------------------------------------ *
 * Rig — planted feet, knees riding the beat, one hand up and pumping
 * ------------------------------------------------------------------ */
export function createRapper(
  x: number,
  y: number,
  box: [number, number, number, number],
): Dancer {
  const view = new Container();
  const rig = new Container();
  rig.position.set(Math.round(x), Math.round(y));

  const legsBack = new Graphics();
  const legsFront = new Graphics();
  const dreadsBack = new Graphics();
  const torsoG = new Graphics();
  const armBack = new Graphics();
  const headG = new Graphics();
  const armFront = new Graphics();
  const micG = new Graphics();
  rig.addChild(legsBack, legsFront, dreadsBack, torsoG, armBack, headG, armFront, micG);
  view.addChild(rig);

  // Clipping happens on the rect lists, in world space, so it also holds
  // in the offline renderer — a Pixi mask would not.
  const put = (g: Graphics, rects: Rect[], ox: number, oy: number) => {
    redraw(
      g,
      clip(
        rects.map((r) => [r[0] + x + ox, r[1] + y + oy, r[2], r[3], r[4], r[5]] as Rect),
        box[0],
        box[1],
        box[2],
        box[3],
      ).map((r) => [r[0] - x, r[1] - y, r[2], r[3], r[4], r[5]] as Rect),
    );
  };

  return {
    view,
    update(t: number) {
      const b = hop(t);
      const sway = wave(t, 4);
      const nod = wave(t, 1);
      const drop = b * 3;
      const bodyY = -Math.round(b * 2);

      const feet: [P2, P2] = [
        [-7 + sway * 2, 0],
        [7 + sway * 2, 0],
      ];
      // upper arm out, forearm pumping up and down once a beat
      const ph = beatPhase(t) * Math.PI * 2;
      const upperOut = ARM_OUT - 0.06 + b * 0.05;
      const forePump = ARM_OUT - Math.sin(ph) * PUMP;
      // Mic arm: elbow pushed out away from his body, forearm angled back
      // up to his mouth. Angles rather than a hand target, because the
      // shape of the bend is the point of the pose.
      const micUpper = 1.35 - b * 0.05;
      const micFore = -2.28 + Math.sin(t * 3.1) * 0.06 + b * 0.04;

      put(legsBack, legRects(-1, feet[0], drop, 1), 0, bodyY);
      put(legsFront, legRects(1, feet[1], drop, -1), 0, bodyY);
      put(dreadsBack, dreadRects(nod * 0.35), 0, bodyY + CHIN_Y - 2);
      put(torsoG, torsoRects(), 0, bodyY);

      const far = drawArm(-1, micUpper, micFore);
      const near = drawArm(1, upperOut, forePump);
      put(armBack, far.rects, 0, bodyY);
      put(headG, headRects(), 0, bodyY + CHIN_Y - Math.round(b * 1));
      put(armFront, near.rects, 0, bodyY);
      put(micG, micRects(far.hand[0] + 4, far.hand[1] - 5), 0, bodyY);
    },
  };
}
