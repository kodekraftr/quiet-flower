/**
 * The hearing rule (build spec §5). Pure module.
 *
 * A listener hears a cast when they are within range, not wearing earmuffs,
 * no CLOSED blocker (door) crosses the straight line to the player, and no
 * active loud noise source masks them.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Listener {
  position: Vec3;
  earmuffs?: boolean;
}

/** Axis-aligned box, e.g. a door. Only blocks sound while closed. */
export interface SoundBlocker {
  min: Vec3;
  max: Vec3;
  closed: boolean;
}

/** Loud source (waterfall) that masks listeners within its radius while active. */
export interface NoiseSource {
  position: Vec3;
  radius: number;
  active: boolean;
}

export type DeafReason = 'distance' | 'earmuffs' | 'door' | 'noise';

export interface HearingResult {
  hears: boolean;
  reason?: DeafReason;
}

export const HEARING_RANGE = 8;

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Slab test: does the segment a→b pass through the box? */
export function segmentHitsBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): boolean {
  let t0 = 0;
  let t1 = 1;
  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
  for (const k of axes) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) {
      if (a[k] < min[k] || a[k] > max[k]) return false;
      continue;
    }
    let tNear = (min[k] - a[k]) / d;
    let tFar = (max[k] - a[k]) / d;
    if (tNear > tFar) [tNear, tFar] = [tFar, tNear];
    t0 = Math.max(t0, tNear);
    t1 = Math.min(t1, tFar);
    if (t0 > t1) return false;
  }
  return true;
}

export function canHear(
  player: Vec3,
  listener: Listener,
  blockers: readonly SoundBlocker[] = [],
  noises: readonly NoiseSource[] = [],
  range: number = HEARING_RANGE,
): HearingResult {
  if (distance(player, listener.position) > range) return { hears: false, reason: 'distance' };
  if (listener.earmuffs) return { hears: false, reason: 'earmuffs' };
  for (const b of blockers) {
    if (b.closed && segmentHitsBox(player, listener.position, b.min, b.max)) {
      return { hears: false, reason: 'door' };
    }
  }
  for (const n of noises) {
    if (n.active && distance(n.position, listener.position) <= n.radius) {
      return { hears: false, reason: 'noise' };
    }
  }
  return { hears: true };
}
