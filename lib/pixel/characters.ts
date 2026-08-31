import { Container, Graphics } from 'pixi.js';
import { C } from './palette';
import { beatIndex, hop, jazzHand, joint, limb, rand, Rect, shape, wave } from './px';

export interface Actor {
  view: Container;
  update: (t: number) => void;
}

/* ------------------------------------------------------------------ *
 * Faces
 *
 * One shared feature set so every principal reads the same way: big
 * two-tone eyes with a pupil and a highlight, brows, a nose pixel, a
 * smile with lifted corners, blush. Drawn for a 10x14 face box whose
 * chin sits on y = 0, mirror-symmetric about x = -0.5 so nothing looks
 * lopsided.
 * ------------------------------------------------------------------ */
/** Head shape with a tapered jaw — square boxes read as robots. */
function faceBox(skin: number, shade: number): Rect[] {
  return [
    [-5, -14, 10, 11, skin],
    [3, -14, 2, 11, shade],
    [-4, -3, 8, 2, skin],
    [2, -3, 2, 2, shade],
    [-3, -1, 6, 1, skin],
    [1, -1, 2, 1, shade],
    // ears
    [-6, -9, 1, 3, shade],
    [5, -9, 1, 3, shade],
  ];
}

interface FaceOpts {
  shade: number;
  iris?: number;
  brow?: number;
  lip?: number;
  blush?: boolean;
  lashes?: boolean;
}

function faceFeatures({
  shade,
  iris = C.iris,
  brow = C.brow,
  lip = C.lip,
  blush = true,
  lashes = false,
}: FaceOpts): Rect[] {
  const out: Rect[] = [
    [-4, -11, 4, 1, brow],
    [0, -11, 4, 1, brow],
    [-4, -9, 3, 1, lashes ? C.lash : brow],
    [1, -9, 3, 1, lashes ? C.lash : brow],
    [-4, -8, 3, 3, C.eyeWhite],
    [1, -8, 3, 3, C.eyeWhite],
    [-4, -8, 2, 3, iris],
    [2, -8, 2, 3, iris],
    [-3, -7, 1, 2, C.pupil],
    [2, -7, 1, 2, C.pupil],
    [-4, -8, 1, 1, C.shine],
    [3, -8, 1, 1, C.shine],
    [-1, -5, 2, 1, shade],
    [-2, -3, 4, 1, lip],
    [-3, -4, 1, 1, lip],
    [2, -4, 1, 1, lip],
    [-1, -2, 2, 1, C.lipDark],
    [-3, -1, 6, 1, shade, 0.55],
  ];
  if (blush) out.push([-5, -5, 2, 2, C.blush, 0.5], [3, -5, 2, 2, C.blush, 0.5]);
  if (lashes) out.push([-5, -9, 1, 2, C.lash], [4, -9, 1, 2, C.lash]);
  return out;
}

/* ------------------------------------------------------------------ *
 * Dancing arms
 *
 * Four authored poses, one per beat, cycled: hands up, one up one out,
 * both elbows out with the hands high, then the mirror. Each pose is
 * built once as a pixel staircase, so the arms stay on the grid and the
 * change lands on the beat like a real animation cel.
 * ------------------------------------------------------------------ */
type ArmPose = [number, number];
const JAZZ: Array<{ l: ArmPose; r: ArmPose }> = [
  { l: [2.45, 2.95], r: [-2.45, -2.95] },
  { l: [2.55, 3.05], r: [-1.5, -2.6] },
  { l: [1.55, 2.85], r: [-1.55, -2.85] },
  { l: [1.5, 2.6], r: [-2.55, -3.05] },
];

interface ArmSpec {
  x: number;
  y: number;
  upper: number;
  fore: number;
  w: number;
  cloth: number;
  skin: number;
  shade: number;
  /** shirt cuff at the wrist, so a dark sleeve does not swallow the hand */
  cuff?: number;
  /** extra art hung off the hand, e.g. the bouquet */
  inHand?: (x: number, y: number) => Rect[];
}

/** One Graphics per pose; only the current one is visible. */
function armPoses(left: ArmSpec, right: ArmSpec): Graphics[] {
  return JAZZ.map(({ l, r }) => {
    const rects: Rect[] = [];
    for (const [spec, pose] of [
      [left, l],
      [right, r],
    ] as Array<[ArmSpec, ArmPose]>) {
      const upper = limb(spec.x, spec.y, pose[0], spec.upper, spec.w, spec.cloth);
      const fore = limb(upper.x, upper.y, pose[1], spec.fore, spec.w - 1, spec.cloth);
      rects.push(...upper.rects, ...fore.rects);
      if (spec.cuff !== undefined) {
        rects.push([Math.round(fore.x - 2), Math.round(fore.y - 2), 4, 4, spec.cuff]);
      }
      if (spec.inHand) {
        rects.push(
          [Math.round(fore.x - 2), Math.round(fore.y - 2), 4, 4, spec.skin],
          ...spec.inHand(fore.x, fore.y),
        );
      } else {
        rects.push(...jazzHand(fore.x, fore.y, pose[1], spec.skin, spec.shade));
      }
    }
    return shape(rects);
  });
}

/* ------------------------------------------------------------------ *
 * Groom — origin sits between his shoes, y grows downward.
 * ------------------------------------------------------------------ */
function buildGroom() {
  const view = new Container();

  const legs = shape([
    [-7, -20, 5, 20, C.suit],
    [2, -20, 5, 20, C.suit],
    [-7, -20, 2, 20, C.suitDark],
    [2, -20, 2, 20, C.suitDark],
    [-8, -3, 7, 3, C.shoe],
    [1, -3, 7, 3, C.shoe],
  ]);

  const torso = shape([
    [-9, -40, 18, 23, C.suit],
    [-9, -40, 4, 23, C.suitDark],
    // shirt front with lapels folded over it
    [-3, -40, 6, 10, C.shirt],
    [-5, -40, 3, 8, C.suit],
    [3, -40, 3, 8, C.suit],
    [-4, -39, 1, 7, C.suitDark],
    [4, -39, 1, 7, C.suitDark],
    [-2, -32, 4, 2, C.shirt],
    // bow tie
    [-3, -38, 2, 3, C.shoe],
    [1, -38, 2, 3, C.shoe],
    [-1, -37, 2, 1, C.suitDark],
    // buttonhole flower + button
    [-7, -34, 2, 3, C.petalLight],
    [-7, -34, 1, 1, C.leaf],
    [-1, -28, 2, 2, C.gold],
  ]);

  const head = new Container();
  head.y = -40;
  head.addChild(
    shape([
      [-2, -1, 4, 3, C.skinShade],
      ...faceBox(C.skin, C.skinShade),
      ...faceFeatures({ shade: C.skinShade }),
      [-6, -17, 12, 5, C.hairDark],
      [-6, -17, 12, 2, C.hairInk],
      [-6, -12, 2, 4, C.hairDark],
      [4, -12, 2, 4, C.hairDark],
      [-5, -13, 5, 2, C.hairDark],
      [1, -13, 5, 1, C.hairInk],
      [1, -16, 3, 1, C.hairSheen],
    ]),
  );

  const arms = armPoses(
    { x: -9, y: -37, upper: 7, fore: 7, w: 4, cloth: C.sleeve, cuff: C.shirt, skin: C.skin, shade: C.skinShade },
    { x: 9, y: -37, upper: 7, fore: 7, w: 4, cloth: C.sleeve, cuff: C.shirt, skin: C.skin, shade: C.skinShade },
  );

  view.addChild(legs, torso);
  for (const a of arms) view.addChild(a);
  view.addChild(head);

  return {
    view,
    update(t: number) {
      const s = wave(t, 2);
      const b = hop(t);
      const i = beatIndex(t, 4);
      for (let k = 0; k < arms.length; k++) arms[k].visible = k === i;
      legs.x = Math.round(s * 1.5);
      torso.x = Math.round(s * 1);
      head.rotation = wave(t, 4) * 0.08;
      head.x = Math.round(s * 1);
      head.y = -40 - Math.round(b * 1);
      for (const a of arms) a.y = -Math.round(b * 1);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Bride — long black hair, tiara, veil hanging behind the whole rig.
 * ------------------------------------------------------------------ */
function buildBride() {
  const view = new Container();

  // narrow at the crown, flaring down behind the dress
  const veil = shape([
    [-7, -58, 14, 5, C.veil, 0.6],
    [-7, -58, 14, 1, C.veil, 0.85],
    [-9, -53, 4, 30, C.veil, 0.42],
    [-10, -23, 4, 16, C.veil, 0.34],
    [5, -53, 4, 30, C.veil, 0.42],
    [6, -23, 4, 16, C.veil, 0.34],
    [-9, -53, 1, 30, C.veil, 0.7],
    [8, -53, 1, 30, C.veil, 0.7],
    [-10, -8, 20, 2, C.veil, 0.28],
  ]);

  const skirt = new Container();
  skirt.position.set(0, -24);
  skirt.addChild(
    shape([
      [-5, 0, 10, 5, C.dress],
      [-7, 4, 14, 5, C.dress],
      [-9, 8, 18, 6, C.dress],
      [-11, 13, 22, 7, C.dress],
      [-12, 19, 24, 5, C.dress],
      [-5, 0, 3, 5, C.dressShade],
      [-7, 4, 4, 5, C.dressShade],
      [-9, 8, 4, 6, C.dressShade],
      [-11, 13, 5, 7, C.dressShade],
      [-12, 19, 5, 5, C.dressShade],
      [-12, 22, 24, 2, C.dressDeep],
    ]),
  );

  const bodice = shape([
    [-6, -37, 12, 14, C.dress],
    [-6, -37, 3, 14, C.dressShade],
    [-6, -26, 12, 3, C.dressDeep],
    // shoulders and a sweetheart neckline
    [-5, -39, 10, 3, C.skin],
    [-4, -37, 3, 1, C.skin],
    [1, -37, 3, 1, C.skin],
    [-6, -38, 2, 2, C.dress],
    [4, -38, 2, 2, C.dress],
    // sash
    [-6, -29, 12, 2, C.petal, 0.85],
    [-6, -29, 12, 1, C.petalLight, 0.7],
    [-1, -29, 2, 3, C.petalDark],
  ]);

  const head = new Container();
  head.y = -39;
  head.addChild(
    shape([
      [-2, -1, 4, 3, C.skinShade],
      ...faceBox(C.skin, C.skinShade),
      ...faceFeatures({ shade: C.skinShade, lashes: true }),
      // long black hair: crown, fringe, then locks past the shoulders
      [-6, -18, 12, 6, C.hairDark],
      [-6, -18, 12, 2, C.hairInk],
      [-4, -17, 3, 1, C.hairSheen],
      [1, -17, 2, 1, C.hairSheen],
      [-6, -13, 3, 3, C.hairDark],
      [3, -13, 3, 3, C.hairDark],
      [-2, -14, 5, 2, C.hairDark],
      [-8, -15, 3, 11, C.hairDark],
      [-9, -6, 3, 9, C.hairDark],
      [-8, 2, 3, 5, C.hairInk],
      [5, -15, 3, 11, C.hairDark],
      [6, -6, 3, 9, C.hairDark],
      [5, 2, 3, 5, C.hairInk],
      [-8, -15, 1, 11, C.hairInk],
      [7, -15, 1, 11, C.hairSheen],
      // tiara
      [-3, -19, 7, 1, C.gold],
      [-1, -21, 2, 2, C.gold],
      [0, -21, 1, 1, C.spark],
      [-3, -20, 1, 1, C.goldDark],
      [3, -20, 1, 1, C.goldDark],
      // blossom tucked behind the ear
      [4, -16, 3, 3, C.petal],
      [5, -15, 1, 1, C.bloomCore],
    ]),
  );

  const bouquet = (x: number, y: number): Rect[] => {
    const bx = Math.round(x);
    const by = Math.round(y);
    return [
      [bx - 4, by, 8, 6, C.petal],
      [bx - 4, by, 3, 6, C.petalDark],
      [bx - 2, by - 2, 4, 2, C.petalLight],
      [bx - 5, by + 3, 3, 3, C.petalLight],
      [bx + 3, by + 2, 3, 3, C.petalDark],
      [bx - 1, by + 2, 2, 2, C.bloomCore],
      [bx - 6, by + 5, 3, 3, C.leaf],
      [bx + 3, by + 5, 3, 3, C.leafDark],
    ];
  };

  const arms = armPoses(
    { x: -6, y: -35, upper: 6, fore: 6, w: 3, cloth: C.skin, skin: C.skin, shade: C.skinShade },
    {
      x: 6,
      y: -35,
      upper: 6,
      fore: 6,
      w: 3,
      cloth: C.skin,
      skin: C.skin,
      shade: C.skinShade,
      inHand: bouquet,
    },
  );

  view.addChild(veil, skirt, bodice);
  for (const a of arms) view.addChild(a);
  view.addChild(head);

  return {
    view,
    update(t: number) {
      // two beats out of phase with the groom, so they trade the raised arm
      const i = beatIndex(t, 4);
      for (let k = 0; k < arms.length; k++) arms[k].visible = k === (i + 2) % 4;
      const b = hop(t, 0.5);
      skirt.rotation = wave(t, 4) * 0.11;
      head.rotation = wave(t, 4) * -0.07;
      head.y = -39 - Math.round(b * 1);
      for (const a of arms) a.y = -Math.round(b * 1);
      veil.rotation = wave(t, 4) * 0.03;
    },
  };
}

/** The two of them, dancing as one rig. */
export function createCouple(): Actor {
  const view = new Container();
  const inner = new Container();
  const groom = buildGroom();
  const bride = buildBride();

  groom.view.x = -13;
  bride.view.x = 13;

  const shadow = shape([[-28, -2, 56, 4, C.crowdShadow, 0.35]]);

  inner.addChild(groom.view, bride.view);
  view.addChild(shadow, inner);

  return {
    view,
    update(t: number) {
      groom.update(t);
      bride.update(t);
      inner.x = Math.round(wave(t, 4) * 4);
      inner.y = -Math.round(hop(t) * 2);
      inner.rotation = wave(t, 4) * 0.03;
      shadow.scale.x = 1 - hop(t) * 0.12;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Rapper — deliberately built small, not scaled down, so his pixels are
 * the same size as everyone else's. He works the riser off to the right
 * of the couple rather than over their heads.
 * ------------------------------------------------------------------ */
export function createRapper(): Actor {
  const view = new Container();
  const inner = new Container();

  const legs = shape([
    [-6, -14, 5, 14, C.pants],
    [1, -14, 5, 14, C.pants],
    [-6, -14, 2, 14, C.pantsDark],
    [1, -14, 2, 14, C.pantsDark],
    [-7, -3, 6, 3, C.speakerCone],
    [1, -3, 6, 3, C.speakerCone],
    [-7, -3, 6, 1, C.sneaker],
    [1, -3, 6, 1, C.sneaker],
  ]);

  const torso = shape([
    [-7, -28, 14, 14, C.hoodie],
    [-7, -28, 4, 14, C.hoodieDark],
    [-7, -16, 14, 2, C.hoodieDark],
    [-4, -28, 8, 2, C.hoodieDark],
    // rope chain
    [-3, -26, 2, 1, C.gold],
    [-1, -25, 2, 1, C.gold],
    [1, -26, 2, 1, C.gold],
    [-2, -24, 3, 2, C.goldDark],
    [-1, -24, 1, 1, C.gold],
  ]);

  const head = new Container();
  head.y = -28;
  head.addChild(
    shape([
      [-4, -9, 8, 9, C.skinDeep],
      [2, -9, 2, 9, C.skinDeepShade],
      // shades
      [-5, -7, 10, 2, C.mic],
      [-4, -7, 2, 1, C.speakerCone],
      [1, -7, 2, 1, C.speakerCone],
      // nose, grin, jaw
      [0, -4, 1, 1, C.skinDeepShade],
      [-2, -3, 4, 1, C.gold],
      [-2, -1, 5, 1, C.skinDeepShade, 0.5],
      // hairline
      [-4, -10, 8, 2, C.hairInk],
    ]),
  );

  const dreadSpec: Array<[number, number, number, number]> = [
    [-4, -8, 8, 0.7],
    [-2, -10, 10, 0.35],
    [1, -10, 10, -0.35],
    [3, -8, 8, -0.7],
    [-5, -5, 7, 1.1],
    [4, -5, 7, -1.1],
  ];
  const dreads: Container[] = [];
  for (let i = 0; i < dreadSpec.length; i++) {
    const [x, y, len, baseRot] = dreadSpec[i];
    const tipped = i === 0 || i === dreadSpec.length - 1;
    const d = joint(x, y, [
      [-1, 0, 2, len, C.hairInk],
      [-1, 0, 1, len, C.hairDark],
      ...(tipped
        ? ([
            [-1, len, 3, 2, C.goldDark],
            [-1, len, 3, 1, C.gold],
          ] as Rect[])
        : ([[-1, len, 2, 2, C.hairDark]] as Rect[])),
    ]);
    d.rotation = baseRot;
    dreads.push(d);
    head.addChildAt(d, 0);
  }

  // Mic arm: a staircase out to the elbow, then back up to his mouth.
  const micArm = shape([
    [7, -26, 3, 3, C.hoodie],
    [9, -28, 3, 3, C.hoodie],
    [9, -31, 3, 4, C.hoodie],
    [11, -31, 1, 4, C.hoodieDark],
    [8, -34, 4, 3, C.skinDeep],
    [8, -34, 1, 3, C.skinDeepShade],
    [8, -36, 3, 3, C.mic],
    [9, -35, 1, 1, C.speakerCone],
    [7, -40, 5, 4, C.mic],
    [8, -39, 3, 2, C.speakerCone],
    [7, -40, 5, 1, C.speakerLip],
  ]);

  // Free hand: two authored poses, thrown up on alternate beats.
  const freeArm = [
    shape([
      ...limb(-7, -25, 2.5, 6, 3, C.hoodie).rects,
      ...limb(-11, -29, 3.0, 5, 3, C.hoodie).rects,
      ...jazzHand(-11.5, -34, 3.0, C.skinDeep, C.skinDeepShade),
    ]),
    shape([
      ...limb(-7, -25, 1.7, 6, 3, C.hoodie).rects,
      ...limb(-13, -24, 2.4, 5, 3, C.hoodie).rects,
      ...jazzHand(-16, -27.5, 2.4, C.skinDeep, C.skinDeepShade),
    ]),
  ];

  const shadow = shape([[-10, -2, 20, 4, C.stageDark, 0.4]]);

  inner.addChild(freeArm[0], freeArm[1], legs, torso, head, micArm);
  view.addChild(shadow, inner);

  return {
    view,
    update(t: number) {
      const b = hop(t);
      const i = beatIndex(t, 2);
      freeArm[0].visible = i === 0;
      freeArm[1].visible = i === 1;
      inner.y = -Math.round(b * 3);
      inner.rotation = wave(t, 2) * 0.04;
      legs.x = Math.round(wave(t, 4) * 1);
      head.rotation = wave(t, 2) * 0.09;
      for (let k = 0; k < dreads.length; k++) {
        const [, , , baseRot] = dreadSpec[k];
        dreads[k].rotation = baseRot + wave(t, 1, k * 0.13) * 0.26;
      }
    },
  };
}
/* ------------------------------------------------------------------ *
 * Crowd — three depths, each with its own treatment so the eye can tell
 * the far guests from the ones we are standing behind.
 * ------------------------------------------------------------------ */
export interface CrowdOptions {
  seed: number;
  /** 0 = hazy back row, 1 = guests at the edge of the floor, 2 = foreground */
  depth: 0 | 1 | 2;
  cheering?: boolean;
}

function blend(a: number, b: number, amount: number): number {
  const ch = (shift: number) =>
    Math.round((((a >> shift) & 0xff) * amount + ((b >> shift) & 0xff) * (1 - amount)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function createCrowdPerson({ seed, depth, cheering }: CrowdOptions): Actor {
  const r = rand(seed);
  const r2 = rand(seed + 13.7);
  const r3 = rand(seed + 27.1);

  // far guests wash out into the backdrop, near ones drop into shadow
  const tint = (color: number) =>
    depth === 0 ? blend(color, C.bgLow, 0.6)
    : depth === 1 ? blend(color, C.bgLow, 0.86)
    : blend(color, C.plumDeep, 0.72);

  const cloth = tint(C.crowd[Math.floor(r * C.crowd.length)]);
  const clothDark = blend(cloth, C.plumDeep, 0.7);
  const skin = tint(r2 > 0.55 ? C.skinDeep : C.skin);
  const hair = tint(r3 > 0.7 ? C.hairBlonde : r3 > 0.3 ? C.hairDark : 0x4a3226);
  const skinShade = blend(skin, C.plumDeep, 0.82);
  const ink = blend(C.pupil, cloth, 0.72);

  const view = new Container();
  const inner = new Container();
  const scale = [0.75, 0.92, 1.12][depth];
  const bodyH = 17 + Math.round(r2 * 5);
  const shoulder = -10 - bodyH;

  const parts: Rect[] = [
    [-4, -12, 3, 12, clothDark],
    [1, -12, 3, 12, clothDark],
    [-6, -12 - bodyH, 12, bodyH, cloth],
    [-6, -12 - bodyH, 4, bodyH, clothDark],
    [-7, -11 - bodyH, 14, 3, cloth],
  ];
  if (depth > 0) parts.push([-6, -13, 12, 2, clothDark]);

  const head = new Container();
  head.y = -12 - bodyH;
  const face: Rect[] = [
    [-4, -11, 8, 9, skin],
    [2, -11, 2, 9, skinShade],
    [-3, -2, 6, 2, skin],
    [1, -2, 2, 2, skinShade],
  ];
  // features: the nearer the guest, the more of the face we resolve
  if (depth >= 1) {
    face.push(
      // brows
      [-3, -8, 2, 1, ink],
      [1, -8, 2, 1, ink],
      // eyes with a pupil and a white
      [-3, -6, 2, 2, C.eyeWhite],
      [1, -6, 2, 2, C.eyeWhite],
      [-3, -6, 1, 2, ink],
      [2, -6, 1, 2, ink],
      // nose + open, cheering mouth
      [0, -4, 1, 1, skinShade],
      [-1, -2, 3, 1, blend(C.lipDark, skin, 0.6)],
      [-3, -1, 6, 1, skinShade, 0.5],
    );
  } else {
    face.push([-3, -6, 1, 2, ink], [2, -6, 1, 2, ink]);
  }
  // hair shape varies so the rows do not read as clones
  if (r3 > 0.66) {
    face.push([-5, -13, 10, 5, hair], [-6, -10, 2, 11, hair], [4, -10, 2, 11, hair]);
  } else if (r3 > 0.33) {
    face.push([-5, -13, 10, 4, hair], [-5, -10, 1, 3, hair], [4, -10, 1, 3, hair], [-2, -16, 5, 3, hair]);
  } else {
    face.push([-5, -13, 10, 4, hair], [-5, -10, 2, 3, hair], [3, -10, 2, 3, hair]);
  }
  head.addChild(shape(face));

  const armL = joint(-6, shoulder, [[-2, 0, 3, 11, cloth], [-2, 10, 3, 3, skin]]);
  const armR = joint(6, shoulder, [[-1, 0, 3, 11, cloth], [-1, 10, 3, 3, skin]]);

  if (depth < 2) {
    view.addChild(shape([[-7, -2, 14, 3, C.floorDark, 0.3]]));
  }
  inner.addChild(armL, shape(parts), head, armR);
  view.addChild(inner);
  view.scale.set(scale);

  const offset = r;
  const up = cheering ?? r2 > 0.6;

  return {
    view,
    update(t: number) {
      const b = hop(t, offset * 0.5);
      inner.y = -Math.round(b * 2);
      head.rotation = wave(t, 4, offset) * 0.09;
      if (up) {
        armL.rotation = 2.45 + b * 0.4;
        armR.rotation = -2.45 - b * 0.4;
      } else {
        armL.rotation = 0.2 + wave(t, 2, offset) * 0.35;
        armR.rotation = -0.2 - wave(t, 2, offset) * 0.35;
      }
    },
  };
}
