/**
 * Every colour in the scene lives here. The palette is deliberately small —
 * that is what makes pixel art read as pixel art rather than as a shrunk photo.
 */
export const C = {
  // backdrop
  bgTop: 0xf3a8b8,
  bgMid: 0xea8fa3,
  bgLow: 0xdd7b93,
  floor: 0xc9647f,
  floorDark: 0x4a4744,
  floorLight: 0xe08ba2,

  // people
  skin: 0xf3c8a2,
  skinShade: 0xd8a37c,
  skinDeep: 0xb5764f,
  skinDeepShade: 0x945c3c,
  eye: 0x2a1a16,

  hairDark: 0x2b2118,
  hairDarker: 0x1a1410,
  // faces — the detail pass
  skinLit: 0xffe3c4,
  skinDeep2: 0xc78f68,
  lipLight: 0xe89aa1,
  hairCool: 0x3b3547,
  lace: 0xfff6f8,
  eyeWhite: 0xfdf4ee,
  iris: 0x5b3524,
  irisDark: 0x3a2116,
  pupil: 0x1a0f0a,
  shine: 0xffffff,
  brow: 0x2b2118,
  lash: 0x1f1712,
  lip: 0xc4666f,
  lipDark: 0x9c4a58,
  blush: 0xef8fa4,
  hairSheen: 0x4c3b2e,
  hairInk: 0x211a14,

  hairBlonde: 0xe9c47d,
  hairBlondeShade: 0xc79e57,

  // groom
  suit: 0x243244,
  sleeve: 0x2d3f56,
  suitDark: 0x18222f,
  shirt: 0xf7f7fb,
  shoe: 0x11151c,

  // bride
  dress: 0xffffff,
  dressShade: 0xe2e6f1,
  dressDeep: 0xc9cfe0,
  veil: 0xfdfdff,

  // rapper
  hoodie: 0x6d4bc4,
  hoodieDark: 0x513792,
  pants: 0x3a3550,
  pantsDark: 0x2a2640,
  sneaker: 0xf3f3f7,
  gold: 0xffd166,
  goldDark: 0xd8a63f,
  mic: 0x2f3440,

  // tables and dressing
  cloth: 0xfffaf4,
  clothShade: 0xf2e4de,
  clothFold: 0xe6d2cf,
  clothDeep: 0xd3bbba,
  clothRim: 0xc7a7aa,
  chair: 0xecc891,
  chairDark: 0xbf9a63,
  chairDeep: 0x8f7146,
  plate: 0xfdfdff,
  plateRim: 0xe6c98a,
  glass: 0xeaf3ff,
  glassDark: 0xc3d5ea,
  wax: 0xfff4da,
  waxShade: 0xe9d9b4,
  flame: 0xffc247,
  flameCore: 0xfff8e2,
  vase: 0xdfe9f3,
  vaseShade: 0xbcccdd,

  // the venue: timber, stone, brick, glass, slate
  wood: 0xc08a4a,
  woodLight: 0xdfae66,
  woodDark: 0x8f5f2f,
  woodDeep: 0x6a4522,
  woodWarm: 0xe0b878,
  teal: 0x6f9c98,
  tealLight: 0x9ec3bd,
  tealDark: 0x4a6f6c,
  brick: 0xb5623c,
  brickDark: 0x8c452a,
  mortar: 0xd9c6ab,
  stone: 0xbfb2a2,
  stoneLight: 0xdad2c6,
  stoneDark: 0x93877a,
  stoneDeep: 0x6d645a,
  duct: 0x3a3a3f,
  ductLight: 0x565660,
  sky: 0xbdd7e6,
  skyPale: 0xe4eef3,
  cloud: 0xf4f8fa,
  mountain: 0x8298a6,
  mountainDark: 0x64798a,
  grass: 0x7ba851,
  grassDark: 0x548039,
  hedge: 0x3f6b31,
  fern: 0x74b74a,
  fernDark: 0x487c33,
  vinePlum: 0x6f3a57,
  vinePlumLight: 0x9c5a7a,
  deck: 0xe3c493,
  deckLight: 0xefd5ab,
  deckPale: 0xf7e7ca,
  deckDark: 0xcda66f,
  deckSeam: 0xa8804f,
  water: 0x6ea5c6,
  waterDeep: 0x4a7fa4,
  waterLight: 0x9fc9de,
  waterShine: 0xdcefff,
  shore: 0xd9c9a2,
  shoreDark: 0xb6a179,
  islandGrass: 0x6f9c47,
  islandDark: 0x4d7533,
  tile: 0x8e8a86,
  tileLight: 0xa9a5a0,
  tilePale: 0xbcb8b3,
  tileDark: 0x726e6b,
  grout: 0x5a5754,

  // the photographer
  jacket: 0x4f8f86,
  jacketDark: 0x2f6660,
  jacketLight: 0x79b3aa,
  shorts: 0x3b4356,
  shortsDark: 0x272d3b,
  kicks: 0xfdf6ea,
  kicksDark: 0xd8c9b4,
  hairAuburn: 0x8a4a2a,
  hairAuburnDark: 0x5f301a,
  hairAuburnLight: 0xb06a3c,
  camBody: 0x24262c,
  camDark: 0x14161a,
  camLens: 0x3d4149,
  camGlass: 0x8fd0e6,
  camRing: 0xb9bcc4,
  flashWhite: 0xffffff,
  portalCore: 0xf0dcff,
  portalMid: 0xb07ce0,
  portalEdge: 0x6a3f9e,

  /**
   * What the guests wear. Deliberately no white and no black: white reads
   * as the bride from across the room, black as the groom, and both
   * disappear against the cloth and the chairs respectively.
   */
  wear: [
    0xc2607a, 0xc4714a, 0xd2a13c, 0x7d9c6a, 0x3f8f96, 0x5a79c0, 0x8a5aa8, 0x8f3a52,
    0x8a8f4a, 0xd9756a, 0xa88fd0, 0x4f7a52, 0xb8607e, 0x6a86b8,
  ],
  hairTones: [0x2b2118, 0x5f301a, 0x8a4a2a, 0xb08a4a, 0xe9c47d, 0x4a3226, 0x6b4a2f],
  /** The men are in black tie: near-black with a lighter edge for form. */
  blackSuit: 0x171922,
  blackSuitEdge: 0x2a2e39,
  blackSuitLift: 0x3d4250,

  // props / nature
  petal: 0xf691b3,
  petalDark: 0xdb6d95,
  petalLight: 0xffc2d8,
  bloomCore: 0xffd166,
  leaf: 0x4f9160,
  leafDark: 0x376b45,
  spark: 0xfff6dc,
  cream: 0xfff6dc,
  plumWire: 0xa8546e,
  plumDeep: 0x5e2b40,
  speaker: 0x2e2a3d,
  speakerDark: 0x1d1a29,
  speakerLip: 0x413b56,
  speakerCone: 0x6f6785,
  stage: 0x8e4a63,
  stageDark: 0x743a50,
  stageTop: 0xa85a76,

  // crowd clothing — cycled through so no two neighbours match
  crowd: [0x4b7bb0, 0xc2564f, 0x5e9e77, 0xb07cc4, 0xd98f45, 0x4c6a8f, 0xc06a90, 0x6f6fa8],
  crowdShadow: 0x9c4f68,
} as const;

/** Logical resolution the whole scene is drawn at, before upscaling. */
export const WORLD_W = 1280;
export const WORLD_H = 720;

/** Seconds per beat — everything on stage moves to this clock (120 BPM). */
export const BEAT = 0.5;

/** Set to true if you prefer chunky integer upscaling with pink letterboxing. */
export const INTEGER_SCALE = false;
