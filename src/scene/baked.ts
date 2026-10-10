/**
 * Baked-light materials. The cell is drawn with unlit materials whose textures
 * already contain Cycles lighting (see art/README.md), so "lighting changes" at
 * runtime are just colour multipliers: a global light level (lantern flicker)
 * times an optional per-material tint (the Rise target highlight).
 */

import { Color, type MeshBasicMaterial } from 'three';

const WHITE = new Color(1, 1, 1);
const materials = new Set<MeshBasicMaterial>();
let level = 1;

function refresh(m: MeshBasicMaterial): void {
  const base = (m.userData.base as Color | undefined) ?? WHITE;
  const tint = m.userData.tint as Color | undefined;
  m.color.copy(base).multiplyScalar(m.userData.glow ? level * level : level);
  if (tint) m.color.multiply(tint);
}

export const baked = {
  /** Track a material. `glow` materials (lantern glass/flame) react more strongly to flicker. */
  add(m: MeshBasicMaterial, glow = false): void {
    m.userData.base = m.color.clone();
    m.userData.glow = glow;
    materials.add(m);
  },
  has(m: unknown): m is MeshBasicMaterial {
    return materials.has(m as MeshBasicMaterial);
  },
  /** 1 = as baked. Lower dims the whole room (used for the lantern flicker). */
  setLevel(l: number): void {
    if (Math.abs(l - level) < 1e-3) return;
    level = l;
    for (const m of materials) refresh(m);
  },
  setTint(m: MeshBasicMaterial, tint: Color | null): void {
    m.userData.tint = tint ?? undefined;
    refresh(m);
  },
};
