// Minimal stand-in for pixi.js, used only by the offline preview renderer.
export class Point {
  constructor(public x = 0, public y = 0) {}
  set(x: number, y = x) {
    this.x = x;
    this.y = y;
  }
}

export class Container {
  children: Container[] = [];
  position = new Point();
  scale = new Point(1, 1);
  rotation = 0;
  alpha = 1;
  zIndex = 0;
  get x() {
    return this.position.x;
  }
  set x(v: number) {
    this.position.x = v;
  }
  get y() {
    return this.position.y;
  }
  set y(v: number) {
    this.position.y = v;
  }
  addChild(...kids: Container[]) {
    this.children.push(...kids);
    return kids[0];
  }
  addChildAt(kid: Container, index: number) {
    this.children.splice(index, 0, kid);
    return kid;
  }
}

export interface RectOp {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  alpha: number;
}

export class Graphics extends Container {
  ops: RectOp[] = [];
  private pending: { x: number; y: number; w: number; h: number } | null = null;
  clear() {
    this.ops.length = 0;
    this.pending = null;
    return this;
  }
  rect(x: number, y: number, w: number, h: number) {
    this.pending = { x, y, w, h };
    return this;
  }
  poly(_points: number[]) {
    this.pending = null;
    return this;
  }
  fill(style: { color: number; alpha?: number }) {
    if (this.pending) {
      this.ops.push({ ...this.pending, color: style.color, alpha: style.alpha ?? 1 });
      this.pending = null;
    }
    return this;
  }
}
