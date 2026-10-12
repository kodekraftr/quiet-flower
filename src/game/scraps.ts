/**
 * The torn song (Scene 2): one sheet of music torn into 5 pieces that the
 * player fits back together. Pure module: piece outlines in sheet space
 * (u, v from 0 to 1, v up) and the snapping rule. No Three.js.
 */

export type UV = readonly [number, number];

export const PIECE_COUNT = 5;
/** A piece snaps home when dropped within this distance (metres) of its place. */
export const SNAP_DISTANCE = 0.06;
/** …and within this distance in front of or behind the page. */
export const SNAP_DEPTH = 0.1;

/** Deterministic wobble so the same tears appear every run. */
function wobble(seed: number, t: number): number {
  return (
    0.018 * Math.sin(t * 23.0 + seed * 1.7) +
    0.011 * Math.sin(t * 57.0 + seed * 4.1) +
    0.006 * Math.sin(t * 131.0 + seed * 2.3)
  );
}

/** Tear sample spacing: 1/GRID of the sheet. */
const GRID = 160;
const H = (u: number): number => 0.52 + wobble(1, u); // horizontal tear: v at u
const T = (v: number): number => 0.47 + wobble(2, v) * 0.8; // top vertical tear: u at v
const B1 = (v: number): number => 0.33 + wobble(3, v) * 0.8;
const B2 = (v: number): number => 0.68 + wobble(4, v) * 0.8;

/**
 * Points t0…t1 on one shared grid (plus both ends), so two pieces that share a
 * tear sample it at exactly the same places and meet without a crack.
 */
function grid(t0: number, t1: number): number[] {
  const out = [t0];
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const inner: number[] = [];
  for (let k = Math.ceil(lo * GRID); k <= Math.floor(hi * GRID); k++) {
    const t = k / GRID;
    if (t > lo + 1e-6 && t < hi - 1e-6) inner.push(t);
  }
  if (t1 < t0) inner.reverse();
  out.push(...inner, t1);
  return out;
}

function alongH(u0: number, u1: number): UV[] {
  return grid(u0, u1).map((u) => [u, H(u)] as UV);
}

function alongV(f: (v: number) => number, v0: number, v1: number): UV[] {
  return grid(v0, v1).map((v) => [f(v), v] as UV);
}

/** Where a vertical tear meets the horizontal one. */
function meet(f: (v: number) => number): UV {
  let v = 0.52;
  for (let i = 0; i < 6; i++) v = H(f(v));
  return [f(v), v];
}

/**
 * The 5 piece outlines, counter-clockwise: top-left, top-right, bottom-left,
 * bottom-middle, bottom-right. Neighbouring pieces share their torn edge exactly.
 */
export function piecePolygons(): UV[][] {
  const [tu, tv] = meet(T);
  const [b1u, b1v] = meet(B1);
  const [b2u, b2v] = meet(B2);
  const topLeft = [...alongH(0, tu).slice(0, -1), ...alongV(T, tv, 1), [0, 1] as UV];
  const topRight = [...alongH(tu, 1), [1, 1] as UV, ...alongV(T, tv, 1).reverse().slice(0, -1)];
  const bottomLeft = [[0, 0] as UV, ...alongV(B1, 0, b1v), ...alongH(0, b1u).reverse().slice(1)];
  const bottomMid = [...alongV(B2, 0, b2v), ...alongH(b1u, b2u).reverse().slice(1, -1), ...alongV(B1, 0, b1v).reverse()];
  const bottomRight = [[1, 0] as UV, [1, H(1)] as UV, ...alongH(b2u, 1).reverse().slice(1, -1), ...alongV(B2, 0, b2v).reverse()];
  return [topLeft, topRight, bottomLeft, bottomMid, bottomRight].map(ccw);
}

/** Signed area (shoelace); positive = counter-clockwise. */
export function polygonArea(poly: readonly UV[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function ccw(poly: UV[]): UV[] {
  return polygonArea(poly) < 0 ? poly.reverse() : poly;
}

export function polygonCentroid(poly: readonly UV[]): UV {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const k = x0 * y1 - x1 * y0;
    a += k;
    cx += (x0 + x1) * k;
    cy += (y0 + y1) * k;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * Tracks which pieces are home. Positions are the piece's offset from its
 * home in page space (metres): x right, y up, z toward the player.
 */
export class ScrapBoard {
  readonly placed: boolean[] = new Array<boolean>(PIECE_COUNT).fill(false);

  /** Returns true if the piece snapped home. */
  drop(id: number, x: number, y: number, z: number): boolean {
    if (this.placed[id]) return true;
    if (Math.hypot(x, y) > SNAP_DISTANCE || Math.abs(z) > SNAP_DEPTH) return false;
    this.placed[id] = true;
    return true;
  }

  get placedCount(): number {
    return this.placed.filter(Boolean).length;
  }

  get complete(): boolean {
    return this.placed.every(Boolean);
  }

  /** First piece still loose, for the keyboard fallback. */
  nextLoose(): number {
    return this.placed.indexOf(false);
  }
}
