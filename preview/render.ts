import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Container, Graphics } from 'pixi.js';
import { buildScene } from '../lib/pixel/scene';
import { WORLD_H, WORLD_W } from '../lib/pixel/palette';

const SCALE = 1;
const t = Number(process.argv[2] ?? 0.17);
const out = process.argv[3] ?? 'frame.png';

const scene = buildScene();
scene.update(t);

const buf = new Uint8Array(WORLD_W * WORLD_H * 3).fill(0);

function put(x: number, y: number, color: number, alpha: number) {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
  const i = (y * WORLD_W + x) * 3;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  buf[i] = Math.round(buf[i] * (1 - alpha) + r * alpha);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - alpha) + g * alpha);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - alpha) + b * alpha);
}

type M = [number, number, number, number, number, number];

function mul(a: M, b: M): M {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function walk(node: Container, parent: M, parentAlpha: number) {
  const c = Math.cos(node.rotation);
  const s = Math.sin(node.rotation);
  const local: M = [
    c * node.scale.x,
    s * node.scale.x,
    -s * node.scale.y,
    c * node.scale.y,
    node.position.x,
    node.position.y,
  ];
  const m = mul(parent, local);
  const a = parentAlpha * node.alpha;

  if (node instanceof Graphics) {
    // Rasterise in DESTINATION space: walk the pixels the transformed rect
    // covers and inverse-map each one back to check it is inside. Walking
    // source pixels instead leaves holes wherever a shape is rotated —
    // which the GPU does not do, so the preview would lie about anything
    // that turns.
    const det = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(det) < 1e-9) return;
    for (const op of node.ops) {
      const corners: Array<[number, number]> = [
        [op.x, op.y],
        [op.x + op.w, op.y],
        [op.x, op.y + op.h],
        [op.x + op.w, op.y + op.h],
      ].map(([lx, ly]) => [m[0] * lx + m[2] * ly + m[4], m[1] * lx + m[3] * ly + m[5]]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const x0 = Math.floor(Math.min(...xs));
      const x1 = Math.ceil(Math.max(...xs));
      const y0 = Math.floor(Math.min(...ys));
      const y1 = Math.ceil(Math.max(...ys));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const dx = x + 0.5 - m[4];
          const dy = y + 0.5 - m[5];
          const lx = (m[3] * dx - m[2] * dy) / det;
          const ly = (-m[1] * dx + m[0] * dy) / det;
          if (lx < op.x || lx >= op.x + op.w || ly < op.y || ly >= op.y + op.h) continue;
          put(x, y, op.color, a * op.alpha);
        }
      }
    }
  }
  for (const kid of node.children) walk(kid, m, a);
}

walk(scene.view, [1, 0, 0, 1, 0, 0], 1);

// upscale + PNG encode
const W = WORLD_W * SCALE;
const H = WORLD_H * SCALE;
const raw = Buffer.alloc((W * 3 + 1) * H);
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0;
  for (let x = 0; x < W; x++) {
    const i = (Math.floor(y / SCALE) * WORLD_W + Math.floor(x / SCALE)) * 3;
    raw[p++] = buf[i];
    raw[p++] = buf[i + 1];
    raw[p++] = buf[i + 2];
  }
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crcBuf]);
}

const table = (() => {
  const tb = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tb[n] = c;
  }
  return tb;
})();

function crc32(b: Buffer) {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;

writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log('wrote', out);
