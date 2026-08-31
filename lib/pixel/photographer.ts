import { Container, Graphics } from 'pixi.js';
import { C } from './palette';
import { ellipse, ik, limb, redraw, Rect, scaleRects } from './px';

export interface Dancer {
  view: Container;
  update: (t: number) => void;
}

/* ==================================================================== *
 * The photographer.
 *
 * She works the room on a fixed nineteen second loop: shoot from the far
 * left, portal across to the second mark, sprint to the right, slide in
 * and shoot lying on the floor, launch up to the hanging lily and shoot
 * one-handed from up there, drop, and portal back to the start.
 *
 * Poses are authored as targets — put this hand here, that foot there —
 * and two-link inverse kinematics works out the joint angles. Writing
 * angles by hand for a dozen poses is guesswork; writing positions is
 * not, and the same rig then handles a run cycle, a slide and a hang
 * without a separate set of art for each.
 *
 * Origin is on the floor between her feet, y grows downward.
 *   floor 0 | ankle -8 | knee -36 | hip -62 | shoulder -94 | chin -102
 *   crown -122
 * ==================================================================== */

const S = 1.06;

const HIP_Y = -62;
const HIP_X = 6;
const SHOULDER_Y = -94;
const SHOULDER_X = 11;
const CHIN_Y = -102;

const THIGH = 28;
const SHIN = 28;
const UPPER = 26;
const FORE = 24;

type P2 = [number, number];

/* ------------------------------------------------------------------ *
 * Body parts
 * ------------------------------------------------------------------ */

function legRects(side: number, foot: P2, hipDrop: number, bend: number): Rect[] {
  const hip: P2 = [HIP_X * side, HIP_Y + hipDrop];
  const [thighA, shinA] = ik(hip, foot, THIGH, SHIN, bend);
  const thigh = limb(hip[0], hip[1], thighA, THIGH, 10, C.shorts);
  const shin = limb(thigh.x, thigh.y, shinA, SHIN, 8, C.skin);
  const out: Rect[] = [];
  out.push(...limb(hip[0], hip[1], thighA, THIGH, 12, C.shortsDark).rects.map(
    (r) => [r[0], r[1], r[2], r[3], r[4], 0.55] as Rect,
  ));
  out.push(...thigh.rects);
  out.push(...limb(hip[0], hip[1], thighA, THIGH * 0.55, 10, C.shorts).rects);
  out.push(...limb(hip[0], hip[1], thighA, THIGH, 3, C.shortsDark).rects.map(
    (r) => [r[0] + (side > 0 ? 4 : -4), r[1], r[2], r[3], r[4], 0.5] as Rect,
  ));
  out.push(...limb(thigh.x, thigh.y, shinA, SHIN, 10, C.skinDeep2).rects.map(
    (r) => [r[0], r[1], r[2], r[3], r[4], 0.4] as Rect,
  ));
  out.push(...shin.rects);
  out.push(...ellipse(thigh.x, thigh.y, 4.5, 4.5, C.skin));
  // sneaker, pointing along the shin
  const dx = -Math.sin(shinA);
  const dy = Math.cos(shinA);
  const fx = shin.x;
  const fy = shin.y;
  out.push(...ellipse(fx, fy, 5.5, 4, C.kicksDark));
  out.push(...ellipse(fx - dy * 3 * side, fy + dx * 3 * side, 6, 3.6, C.kicks));
  out.push(...ellipse(fx, fy + 1.5, 5, 2, C.kicksDark));
  return out;
}

function torsoRects(lean: number): Rect[] {
  const out: Rect[] = [];
  // jacket
  for (let y = SHOULDER_Y; y < HIP_Y + 2; y++) {
    const t = (y - SHOULDER_Y) / (HIP_Y + 2 - SHOULDER_Y);
    const w = Math.round(26 - t * 5);
    const half = Math.round(w / 2);
    const h = y === HIP_Y + 1 ? 1 : 2;
    out.push([-half, y, w, h, C.jacket]);
    out.push([-half, y, 4, h, C.jacketDark]);
    out.push([half - 3, y, 3, h, C.jacketLight, 0.5]);
  }
  // collar, zip, hem
  out.push([-9, SHOULDER_Y - 2, 18, 4, C.jacketDark]);
  out.push([-1, SHOULDER_Y, 2, HIP_Y + 2 - SHOULDER_Y, C.jacketDark, 0.8]);
  out.push([-13, HIP_Y - 1, 26, 3, C.jacketDark]);
  // camera strap across the chest
  for (let i = 0; i < 20; i++) {
    out.push([Math.round(-11 + i * 1.1), Math.round(SHOULDER_Y + 2 + i * 1.15), 3, 2, C.camDark]);
  }
  // a bag on the hip
  out.push([6, HIP_Y - 6, 12, 12, C.camBody]);
  out.push([6, HIP_Y - 6, 12, 3, C.camLens]);
  out.push([9, HIP_Y - 1, 6, 2, C.gold, 0.7]);
  // lean shows as a shifted highlight, not a redrawn body
  if (lean !== 0) out.push([-13, SHOULDER_Y, 3, 20, C.jacketDark, 0.35]);
  return out;
}

function armRects(side: number, hand: P2, bend: number): { rects: Rect[]; hand: P2 } {
  const sh: P2 = [SHOULDER_X * side, SHOULDER_Y + 3];
  const [upperA, foreA] = ik(sh, hand, UPPER, FORE, bend);
  const upper = limb(sh[0], sh[1], upperA, UPPER, 7, C.jacket);
  const fore = limb(upper.x, upper.y, foreA, FORE, 6, C.skin);
  const out: Rect[] = [];
  out.push(...limb(sh[0], sh[1], upperA, UPPER, 9, C.jacketDark).rects.map(
    (r) => [r[0], r[1], r[2], r[3], r[4], 0.5] as Rect,
  ));
  out.push(...ellipse(sh[0], sh[1], 5.5, 5.5, C.jacket));
  out.push(...upper.rects);
  out.push(...limb(sh[0], sh[1], upperA, UPPER, 3, C.jacketLight).rects.map(
    (r) => [r[0] - 2, r[1], r[2], r[3], r[4], 0.4] as Rect,
  ));
  // cuff, then the forearm
  out.push(...ellipse(upper.x, upper.y, 4.5, 4.5, C.jacketDark));
  out.push(...limb(upper.x, upper.y, foreA, FORE, 8, C.skinDeep2).rects.map(
    (r) => [r[0], r[1], r[2], r[3], r[4], 0.4] as Rect,
  ));
  out.push(...fore.rects);
  out.push(...ellipse(fore.x, fore.y, 3.6, 3.6, C.skin));
  return { rects: out, hand: [fore.x, fore.y] };
}

function headRects(shooting: boolean): Rect[] {
  const out: Rect[] = [];
  for (let y = -20; y < 0; y++) {
    let w = 16;
    if (y > -6) w = 16 - Math.round(((y + 6) / 6) * 5);
    if (y > -3) w = 11 - Math.round(((y + 3) / 3) * 4);
    const half = Math.round(w / 2);
    const h = y === -1 ? 1 : 2;
    out.push([-half, y, w, h, C.skin]);
    out.push([half - 2, y, 2, h, C.skinShade]);
  }
  out.push([-9, -11, 2, 4, C.skinShade], [7, -11, 2, 4, C.skinDeep2]);
  // brows
  out.push([-7, -14, 4, 1, C.hairAuburnDark], [3, -14, 4, 1, C.hairAuburnDark]);
  if (shooting) {
    // one eye shut against the viewfinder, the other wide
    out.push([-7, -11, 4, 1, C.lash]);
    out.push([3, -12, 4, 4, C.eyeWhite]);
    out.push([3, -12, 3, 4, C.iris]);
    out.push([4, -11, 2, 2, C.pupil]);
    out.push([4, -12, 1, 1, C.shine]);
  } else {
    for (const flip of [false, true]) {
      const x = flip ? 3 : -7;
      out.push([x, -12, 4, 1, C.lash]);
      out.push([x, -11, 4, 3, C.eyeWhite]);
      out.push([flip ? x : x + 1, -11, 3, 3, C.iris]);
      out.push([x + 1, -10, 2, 2, C.pupil]);
      out.push([flip ? x + 2 : x + 1, -11, 1, 1, C.shine]);
    }
  }
  out.push([0, -6, 1, 1, C.skinShade]);
  out.push([-2, -4, 4, 1, C.lip]);
  out.push([-1, -3, 2, 1, C.lipDark]);
  out.push([-8, -7, 3, 2, C.blush, 0.4], [5, -7, 3, 2, C.blush, 0.4]);
  // hair: short, swept, with a band
  for (let y = -23; y < -13; y++) {
    const t = (y + 23) / 10;
    const w = Math.round(11 + t * 9);
    const half = Math.round(w / 2);
    out.push([-half, y, w, 2, C.hairAuburn]);
  }
  out.push([-10, -15, 20, 3, C.hairAuburn]);
  out.push([-6, -22, 6, 2, C.hairAuburnLight, 0.8]);
  out.push([-10, -13, 3, 6, C.hairAuburn], [7, -13, 3, 7, C.hairAuburn]);
  out.push([-11, -17, 22, 2, C.jacketDark]);
  out.push([-11, -17, 22, 1, C.jacketLight, 0.7]);
  return out;
}

/** Ponytail, its own layer so it can swing. */
function tailRects(): Rect[] {
  const out: Rect[] = [];
  out.push(...ellipse(0, 2, 4, 4, C.hairAuburnDark));
  for (let i = 0; i < 22; i++) {
    const w = Math.max(2, 8 - Math.round(i / 4));
    const x = Math.round(Math.sin(i / 7) * 3);
    out.push([x - Math.round(w / 2), 4 + i, w, 2, i % 6 === 0 ? C.hairAuburn : C.hairAuburnDark]);
  }
  out.push(...ellipse(Math.round(Math.sin(22 / 7) * 3), 27, 2.5, 3, C.hairAuburnDark));
  return out;
}

/** The camera, pointed along `aim`. */
function cameraRects(x: number, y: number, aim: number): Rect[] {
  const dx = Math.cos(aim);
  const dy = Math.sin(aim);
  const out: Rect[] = [];
  // body
  out.push(...ellipse(x, y, 8, 6.5, C.camDark));
  out.push([Math.round(x - 7), Math.round(y - 5), 14, 10, C.camBody]);
  out.push([Math.round(x - 7), Math.round(y - 5), 14, 2, C.camLens]);
  out.push([Math.round(x - 7), Math.round(y - 5), 3, 10, C.camLens, 0.6]);
  // pentaprism and shutter button
  out.push([Math.round(x - 3), Math.round(y - 8), 6, 3, C.camBody]);
  out.push([Math.round(x + 3), Math.round(y - 7), 3, 2, C.camRing]);
  // lens barrel along the aim
  for (let i = 0; i < 9; i++) {
    const lx = x + dx * (5 + i);
    const ly = y + dy * (5 + i);
    out.push(...ellipse(lx, ly, 5.5 - i * 0.1, 5.5 - i * 0.1, i > 6 ? C.camRing : C.camLens));
  }
  const gx = x + dx * 14;
  const gy = y + dy * 14;
  out.push(...ellipse(gx, gy, 4.4, 4.4, C.camDark));
  out.push(...ellipse(gx, gy, 3.2, 3.2, C.camGlass));
  out.push(...ellipse(gx - dy * 1.2, gy + dx * 1.2, 1.4, 1.4, C.cream, 0.9));
  return out;
}

/* ------------------------------------------------------------------ *
 * Effects
 * ------------------------------------------------------------------ */

/**
 * A doorway rather than a hoop: tall enough to swallow her whole, and
 * opaque, because she walks in behind it instead of shrinking into it.
 * `open` 0..1 opens it as a slit and widens it out.
 */
function portalRects(open: number): Rect[] {
  if (open < 0.02) return [];
  const rx = 4 + open * 30;
  const ry = 20 + open * 58;
  const out: Rect[] = [];
  out.push(...ellipse(0, 0, rx * 1.3, ry * 1.08, C.portalEdge, 0.22));
  out.push(...ellipse(0, 0, rx * 1.12, ry, C.portalEdge));
  out.push(...ellipse(0, 0, rx * 0.9, ry * 0.94, C.portalMid));
  out.push(...ellipse(0, 0, rx * 0.62, ry * 0.86, C.portalCore));
  out.push(...ellipse(0, 0, rx * 0.3, ry * 0.7, C.flashWhite, 0.85));
  // a bright slit down the middle while it is still opening
  out.push([-1, Math.round(-ry), 3, Math.round(ry * 2), C.flashWhite, 0.5 * (1 - open)]);
  // sparks round the rim
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + open * 6;
    out.push([
      Math.round(Math.cos(a) * rx * 1.15),
      Math.round(Math.sin(a) * ry * 1.02),
      2,
      2,
      i % 2 ? C.portalCore : C.portalMid,
      0.9,
    ]);
  }
  return out;
}

function flashRects(f: number): Rect[] {
  if (f <= 0.02) return [];
  const out: Rect[] = [];
  const r = 8 + f * 26;
  out.push(...ellipse(0, 0, r, r, C.flashWhite, 0.16 * f));
  out.push(...ellipse(0, 0, r * 0.6, r * 0.6, C.flashWhite, 0.4 * f));
  out.push(...ellipse(0, 0, r * 0.28, r * 0.28, C.flashWhite, f));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const l = r * (1.1 + (i % 2) * 0.5);
    out.push([
      Math.round(Math.cos(a) * l * 0.4),
      Math.round(Math.sin(a) * l * 0.4),
      Math.max(1, Math.round(Math.abs(Math.cos(a)) * l * 0.5)),
      Math.max(1, Math.round(Math.abs(Math.sin(a)) * l * 0.5)),
      C.flashWhite,
      0.5 * f,
    ]);
  }
  return out;
}

function puffRects(x: number, y: number, age: number): Rect[] {
  if (age <= 0 || age >= 1) return [];
  const r = 3 + age * 11;
  const a = (1 - age) * 0.5;
  return [
    ...ellipse(x, y - age * 5, r, r * 0.6, C.cream, a),
    ...ellipse(x - r * 0.5, y - age * 3, r * 0.5, r * 0.34, C.deckDark, a * 0.6),
    ...ellipse(x + r * 0.6, y - age * 4, r * 0.4, r * 0.3, C.cream, a * 0.8),
  ];
}

/* ------------------------------------------------------------------ *
 * The routine
 * ------------------------------------------------------------------ */

const P1: P2 = [78, 648];
const P2P: P2 = [392, 660];
// Forward of table 2 and to the right of it. Table 2 occupies x 916..1088
// with its cloth hanging to y=662; anything standing in that span with its
// feet on this line reads as standing on the tablecloth, so the run has to
// end clear of it and the slide has to run out to the right.
const P3: P2 = [1240, 696];
/** Where her gripping hand meets the hanging lily. */
const LILY: P2 = [1158, 246];

/** How far she covers on her belly — she starts it right of table 2. */
const SLIDE_LEN = 128;

const PHASES: Array<[string, number]> = [
  ['shoot1', 3.2],
  ['out1', 0.8],
  ['in2', 0.7],
  ['shoot2', 2.2],
  ['run', 2.4],
  ['slide', 1.15],
  ['prone', 2.4],
  ['rise', 0.6],
  ['jump', 1.2],
  ['hang', 2.6],
  ['fall', 0.9],
  ['out2', 0.8],
  ['in1', 0.7],
];
const STARTS: number[] = [];
{
  let acc = 0;
  for (const [, d] of PHASES) {
    STARTS.push(acc);
    acc += d;
  }
}
const LOOP = STARTS[STARTS.length - 1] + PHASES[PHASES.length - 1][1];

/**
 * Which side of a mark its doorway opens on. At mark 3 it has to open to
 * her left, or it would run off the right edge of the room.
 */
const portalSide = (name: string) => (name === 'out2' ? -40 : 34);

const ease = (u: number) => u * u * (3 - 2 * u);

/** Feet for a walk cycle, half a phase apart. */
function walkStep(t: number, rate: number): [P2, P2] {
  const foot = (k: number): P2 => {
    const ph = t * rate + k;
    return [Math.cos(ph * Math.PI * 2) * 10, -Math.max(0, Math.sin(ph * Math.PI * 2)) * 7];
  };
  return [foot(0), foot(0.5)];
}
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Decaying pulse for each shutter release listed in `shots`. */
function shutter(u: number, shots: number[]): number {
  let f = 0;
  for (const s of shots) {
    if (u >= s) f = Math.max(f, Math.max(0, 1 - (u - s) * 9));
  }
  return f;
}

interface Pose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  alpha: number;
  hipDrop: number;
  feet: [P2, P2];
  hands: [P2, P2];
  headRot: number;
  tailRot: number;
  aim: number;
  shooting: boolean;
  flash: number;
  /** local point the camera is drawn at; null = between the hands */
  camAt: P2 | null;
}

export function createPhotographer(): Dancer {
  const view = new Container();

  const rig = new Container();
  const tailC = new Container();
  const tailG = new Graphics();
  tailC.addChild(tailG);
  const legsBack = new Graphics();
  const legsFront = new Graphics();
  const torsoG = new Graphics();
  const armBack = new Graphics();
  const armFront = new Graphics();
  const headC = new Container();
  const headG = new Graphics();
  headC.addChild(headG);
  const camG = new Graphics();

  rig.addChild(legsBack, tailC, torsoG, legsFront, armBack, headC, armFront, camG);

  const fx = new Graphics();
  const portalG = new Graphics();
  const overlay = new Graphics();

  // the rig first, then the doorway over it — that is what makes walking
  // into the portal read as walking into it
  view.addChild(rig, portalG, fx, overlay);

  redraw(tailG, scaleRects(tailRects(), S));

  // dust puffs, seeded when she slides and when she lands
  const puffs: Array<{ x: number; y: number; born: number }> = [];

  return {
    view,
    update(t: number) {
      const tt = ((t % LOOP) + LOOP) % LOOP;
      let idx = 0;
      for (let i = 0; i < PHASES.length; i++) {
        if (tt >= STARTS[i]) idx = i;
      }
      const [name, dur] = PHASES[idx];
      const u = Math.min(1, (tt - STARTS[idx]) / dur);

      // ---- defaults: standing, camera at the eye
      const p: Pose = {
        x: P1[0],
        y: P1[1],
        rot: 0,
        scale: 1,
        alpha: 1,
        hipDrop: 0,
        feet: [
          [-5, 0],
          [5, 0],
        ],
        hands: [
          [2, -101],
          [8, -105],
        ],
        headRot: 0,
        tailRot: 0,
        aim: -0.12,
        shooting: true,
        flash: 0,
        camAt: null,
      };
      const breathe = Math.sin(t * 2.2) * 0.6;

      switch (name) {
        case 'shoot1': {
          p.x = P1[0];
          p.y = P1[1] + breathe;
          p.flash = shutter(u, [0.22, 0.52, 0.82]);
          p.headRot = Math.sin(t * 0.9) * 0.05;
          p.aim = -0.16 + Math.sin(t * 0.7) * 0.06;
          break;
        }
        case 'shoot2': {
          p.x = P2P[0];
          p.y = P2P[1] + breathe;
          p.flash = shutter(u, [0.28, 0.72]);
          // crouches a little for a lower angle
          p.hipDrop = 5;
          p.feet = [
            [-8, 0],
            [7, 0],
          ];
          p.aim = -0.22;
          p.headRot = 0.04;
          break;
        }
        case 'out1':
        case 'out2': {
          // She keeps her size and walks into it; the doorway is drawn in
          // front of her, so she disappears behind it.
          const at = name === 'out1' ? P1 : P3;
          const walk = ease(Math.min(1, u / 0.8));
          p.x = lerp(at[0], at[0] + portalSide(name), walk);
          p.y = at[1];
          p.alpha = u > 0.82 ? 1 - (u - 0.82) / 0.18 : 1;
          p.shooting = false;
          p.camAt = [10, -76];
          p.hands = [
            [-7, -76 + Math.sin(t * 10) * 5],
            [10, -78],
          ];
          p.feet = walkStep(t, 1.5);
          p.headRot = -0.05;
          break;
        }
        case 'in2':
        case 'in1': {
          const at = name === 'in2' ? P2P : P1;
          const walk = ease(Math.max(0, (u - 0.2) / 0.8));
          p.x = lerp(at[0] + portalSide(name), at[0], walk);
          p.y = at[1];
          p.alpha = u < 0.12 ? 0 : 1;
          p.shooting = false;
          p.camAt = [10, -76];
          p.hands = [
            [-7, -76 + Math.sin(t * 10) * 5],
            [10, -78],
          ];
          p.feet = walkStep(t, 1.5);
          p.headRot = 0.05;
          break;
        }
        case 'run': {
          const uu = ease(u);
          p.x = lerp(P2P[0], P3[0] - SLIDE_LEN, uu);
          p.y = lerp(P2P[1], P3[1], uu) - Math.abs(Math.sin(t * 15)) * 2;
          p.rot = 0.1;
          p.shooting = false;
          p.tailRot = -0.9 + Math.sin(t * 15) * 0.25;
          p.headRot = -0.08;
          // feet on a running ellipse, half a cycle apart
          const step = (k: number): P2 => {
            const ph = t * 2.4 + k;
            return [Math.cos(ph * Math.PI * 2) * 15, -Math.max(0, Math.sin(ph * Math.PI * 2)) * 15];
          };
          p.feet = [step(0), step(0.5)];
          // camera held to the chest, other arm pumping
          const pump = Math.sin(t * 15);
          p.hands = [
            [-10 - pump * 6, -80 + pump * 8],
            [10, -84],
          ];
          p.camAt = [13, -84];
          p.aim = -0.4;
          break;
        }
        case 'slide': {
          const uu = ease(u);
          p.x = lerp(P3[0] - SLIDE_LEN, P3[0], uu);
          p.rot = lerp(0.1, -1.42, ease(Math.min(1, u * 1.25)));
          p.y = lerp(P3[1], P3[1] - 11, ease(Math.min(1, u * 1.4)));
          p.shooting = u > 0.55;
          p.tailRot = -1.2;
          p.headRot = 0.3;
          p.feet = [
            [-7, 2],
            [7, 6],
          ];
          p.hands = u > 0.5 ? [[2, -118], [7, -112]] : [[-8, -78], [12, -86]];
          p.camAt = null;
          p.aim = -1.72;
          if (u < 0.75 && Math.random() < 0.5) {
            puffs.push({ x: p.x - 14 + Math.random() * 10, y: P3[1] - 2, born: t });
          }
          break;
        }
        case 'prone': {
          p.x = P3[0];
          p.y = P3[1] - 11;
          p.rot = -1.42;
          p.headRot = 0.32 + Math.sin(t * 2) * 0.03;
          p.tailRot = -1.25;
          p.feet = [
            [-7, 2],
            [7, 6],
          ];
          p.hands = [
            [2, -118],
            [7, -112],
          ];
          p.aim = -1.72;
          p.flash = shutter(u, [0.24, 0.66]);
          break;
        }
        case 'rise': {
          const uu = ease(u);
          p.x = P3[0];
          p.y = lerp(P3[1] - 11, P3[1], uu);
          p.rot = lerp(-1.42, 0, uu);
          p.shooting = false;
          p.hipDrop = (1 - uu) * 10;
          p.hands = [
            [-8, -80],
            [11, -84],
          ];
          p.camAt = [14, -84];
          p.tailRot = -0.5 * (1 - uu);
          break;
        }
        case 'jump': {
          const uu = u;
          p.x = lerp(P3[0], LILY[0], uu);
          p.y = lerp(P3[1], LILY[1] + 146, uu) - Math.sin(Math.PI * uu) * 74;
          p.rot = -0.12;
          p.shooting = false;
          p.tailRot = -1.5 + uu * 0.6;
          // legs tucked, arms reaching for the lily
          p.feet = [
            [-4, -24 - Math.sin(Math.PI * uu) * 6],
            [7, -19 - Math.sin(Math.PI * uu) * 6],
          ];
          p.hands = [
            [-3, -138],
            [6, -132],
          ];
          p.camAt = [12, -92];
          p.aim = -0.9;
          break;
        }
        case 'hang': {
          const sway = Math.sin(t * 1.6);
          p.x = LILY[0] + sway * 2;
          p.y = LILY[1] + 146;
          p.rot = sway * 0.05;
          p.headRot = 0.1;
          p.tailRot = 0.15 + sway * 0.1;
          // one hand gripping overhead, the other working the camera
          p.hands = [
            [-2, -146],
            [12, -100],
          ];
          p.feet = [
            [-6, 6 + sway * 2],
            [6, 10 - sway * 2],
          ];
          p.camAt = [16, -100];
          p.aim = 2.62;
          p.flash = shutter(u, [0.26, 0.7]);
          break;
        }
        case 'fall': {
          const uu = u * u;
          p.x = lerp(LILY[0], P3[0], u);
          p.y = lerp(LILY[1] + 146, P3[1], uu);
          p.rot = 0.1 - u * 0.2;
          p.shooting = false;
          p.tailRot = 1.3;
          p.hands = [
            [-12, -132],
            [12, -128],
          ];
          p.feet = [
            [-5, 4],
            [6, 2],
          ];
          p.camAt = [15, -92];
          p.aim = -0.5;
          if (u > 0.86) {
            // landing squash
            p.hipDrop = 12;
            p.feet = [
              [-9, 0],
              [9, 0],
            ];
            p.hands = [
              [-13, -86],
              [13, -88],
            ];
            if (puffs.length === 0 || t - puffs[puffs.length - 1].born > 0.4) {
              puffs.push({ x: P3[0] - 10, y: P3[1] - 2, born: t });
              puffs.push({ x: P3[0] + 12, y: P3[1] - 2, born: t });
            }
          }
          break;
        }
      }

      // ---- drive the rig
      rig.position.set(Math.round(p.x), Math.round(p.y));
      rig.rotation = p.rot;
      rig.alpha = p.alpha;
      rig.scale.set(p.scale);
      headC.position.set(0, Math.round(CHIN_Y * S));
      headC.rotation = p.headRot;
      tailC.position.set(Math.round(-2 * S), Math.round((CHIN_Y - 14) * S));
      tailC.rotation = p.tailRot;

      const far = armRects(-1, p.hands[0], 1);
      const near = armRects(1, p.hands[1], -1);
      redraw(legsBack, scaleRects(legRects(-1, p.feet[0], p.hipDrop, 1), S));
      redraw(legsFront, scaleRects(legRects(1, p.feet[1], p.hipDrop, -1), S));
      redraw(torsoG, scaleRects(torsoRects(p.rot), S));
      redraw(armBack, scaleRects(far.rects, S));
      redraw(armFront, scaleRects(near.rects, S));
      redraw(headG, scaleRects(headRects(p.shooting), S));

      // camera: between the hands unless the pose says otherwise
      const camLocal: P2 = p.camAt ?? [
        (far.hand[0] + near.hand[0]) / 2 + 3,
        (far.hand[1] + near.hand[1]) / 2,
      ];
      redraw(camG, scaleRects(cameraRects(camLocal[0], camLocal[1], p.aim), S));

      // ---- portal, sized by the phase
      let portalOpen = 0;
      let portalAt: P2 = P1;
      if (name === 'out1' || name === 'out2') {
        // opens fast, holds while she steps through, snaps shut
        portalOpen = u < 0.25 ? u / 0.25 : u > 0.9 ? (1 - u) / 0.1 : 1;
        portalAt = name === 'out1' ? P1 : P3;
      } else if (name === 'in2' || name === 'in1') {
        portalOpen = u < 0.12 ? u / 0.12 : u > 0.8 ? (1 - u) / 0.2 : 1;
        portalAt = name === 'in2' ? P2P : P1;
      }
      portalG.position.set(portalAt[0] + portalSide(name), portalAt[1] - 74);
      redraw(portalG, portalRects(Math.max(0, Math.min(1, portalOpen))));

      // ---- flash at the lens, and a lick of it across the room
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      const lens: P2 = [
        camLocal[0] * S + Math.cos(p.aim) * 15,
        camLocal[1] * S + Math.sin(p.aim) * 15,
      ];
      const fxRects: Rect[] = [];
      if (p.flash > 0.02) {
        const wx = p.x + (lens[0] * cos - lens[1] * sin) * p.scale;
        const wy = p.y + (lens[0] * sin + lens[1] * cos) * p.scale;
        fxRects.push(
          ...flashRects(p.flash).map(
            (r) => [r[0] + Math.round(wx), r[1] + Math.round(wy), r[2], r[3], r[4], r[5]] as Rect,
          ),
        );
      }
      // motion streaks while running
      if (name === 'run') {
        for (let i = 0; i < 4; i++) {
          fxRects.push([
            Math.round(p.x - 26 - i * 13),
            Math.round(p.y - 40 - i * 12 - (i % 2) * 6),
            10 + i * 3,
            2,
            C.cream,
            0.3 - i * 0.05,
          ]);
        }
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const age = (t - puffs[i].born) / 0.7;
        if (age >= 1) {
          puffs.splice(i, 1);
          continue;
        }
        fxRects.push(...puffRects(puffs[i].x, puffs[i].y, age));
      }
      redraw(fx, fxRects);
      redraw(
        overlay,
        p.flash > 0.05
          ? [[0, 0, 1280, 720, C.flashWhite, 0.1 * p.flash] as Rect]
          : [],
      );
    },
  };
}
