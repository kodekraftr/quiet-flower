/**
 * Turns a room exported by art/bake_export.py into what the headset draws:
 * every textured surface becomes an unlit MeshBasicMaterial showing its baked
 * Cycles light; emissive and gap-only surfaces become flat colours. All of
 * them join the `baked` registry, so torch / lantern flicker can dim the room.
 */

import { type CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, SRGBColorSpace } from 'three';
import { baked } from './baked.js';

export type FlatColours = Record<string, { color: number; glow?: boolean }>;

/** Shared by every baked room. */
export const COMMON_FLATS: FlatColours = {
  emit_flame: { color: 0xfff0c0, glow: true },
  emit_tunnel: { color: 0x000000 },
  flat_mortar: { color: 0x0b0a08 },
};

/**
 * Replaces the room's materials. `onFlat(key, mesh)` is called for each flat
 * surface (e.g. to find the lantern glass).
 */
export function prepareBakedRoom(room: Object3D, flats: FlatColours, onFlat?: (key: string, mesh: Mesh) => void): void {
  const meshes: Mesh[] = [];
  room.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  const keys = Object.keys(flats);
  for (const mesh of meshes) {
    const names = `${mesh.name} ${(mesh.material as { name?: string }).name ?? ''}`;
    const key = keys.find((k) => names.includes(k));
    const old = mesh.material as MeshBasicMaterial & { map?: CanvasTexture | null };
    let mat: MeshBasicMaterial;
    if (key) {
      mat = new MeshBasicMaterial({ color: flats[key].color });
      baked.add(mat, flats[key].glow);
      onFlat?.(key, mesh);
    } else {
      const map = old.map ?? null;
      if (map) map.colorSpace = SRGBColorSpace;
      mat = new MeshBasicMaterial({ map });
      baked.add(mat);
    }
    old.dispose?.();
    mesh.material = mat;
  }
}

/** Takes named movable objects out of the room (they become their own entities). */
export function takeNodes<K extends string>(room: Object3D, file: string, names: readonly K[]): Record<K, Object3D> {
  const out = {} as Record<K, Object3D>;
  for (const name of names) {
    const o = room.getObjectByName(name);
    if (!o) throw new Error(`${file} is missing "${name}"`);
    o.removeFromParent();
    out[name] = o;
  }
  return out;
}
