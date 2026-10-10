/**
 * Readable hand pose for the /test page: which fingers are open, and where a
 * palm sits relative to a reference point along the viewer's axes.
 * Pure module: no Three.js, no allocation.
 */

import { curlRatio, FINGERS, FIST_RATIO, J, jointDistance, type HandSample, type Point3 } from './gestures.js';

export const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;

/**
 * Thumb tip → pinky knuckle ÷ palm width (index knuckle → pinky knuckle).
 * About 1.7–2.0 with the thumb out, near 1.0–1.3 when it is tucked over the
 * fingers. Tune on the headset.
 */
export const THUMB_OPEN_RATIO = 1.5;

export function thumbRatio(h: HandSample): number {
  return jointDistance(h, J.THUMB_TIP, J.PINKY_PROX) / Math.max(jointDistance(h, J.INDEX_PROX, J.PINKY_PROX), 1e-4);
}

/**
 * Fills `out` with five open (true) / closed (false) flags: thumb, index,
 * middle, ring, pinky. Fingers use the same rule as `isFist`, so four closed
 * fingers here always means the game sees a fist.
 */
export function fingerStates(h: HandSample, out: boolean[]): boolean[] {
  out[0] = thumbRatio(h) >= THUMB_OPEN_RATIO;
  for (let i = 0; i < FINGERS.length; i++) out[i + 1] = curlRatio(h, FINGERS[i][0], FINGERS[i][1]) >= FIST_RATIO;
  return out;
}

/**
 * `palm − origin` along the viewer's axes, in metres: x = right, y = up,
 * z = forward. `right` and `forward` must be horizontal unit vectors.
 */
export function handOffset(palm: Point3, origin: Point3, right: Point3, forward: Point3, out: Point3): Point3 {
  const dx = palm.x - origin.x;
  const dy = palm.y - origin.y;
  const dz = palm.z - origin.z;
  out.x = dx * right.x + dz * right.z;
  out.y = dy;
  out.z = dx * forward.x + dz * forward.z;
  return out;
}
