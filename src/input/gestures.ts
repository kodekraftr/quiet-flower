/**
 * Gesture detection over the 25 WebXR hand joints (build spec §4).
 * Pure module: input is joint positions in metres (world space), output is
 * gesture state. No Three.js, no allocation in update paths.
 */

export const JOINT_COUNT = 25;

/** WebXR hand joint names in the standard order (index = position in the array). */
export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
] as const;

export const J = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_PROX: 6,
  INDEX_TIP: 9,
  MIDDLE_PROX: 11,
  MIDDLE_TIP: 14,
  RING_PROX: 16,
  RING_TIP: 19,
  PINKY_PROX: 21,
  PINKY_TIP: 24,
} as const;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface HandSample {
  tracked: boolean;
  /** JOINT_COUNT × xyz, metres, world space. */
  joints: Float32Array;
}

export function createHandSample(): HandSample {
  return { tracked: false, joints: new Float32Array(JOINT_COUNT * 3) };
}

export function jointDistance(h: HandSample, a: number, b: number): number {
  const j = h.joints;
  return Math.hypot(j[a * 3] - j[b * 3], j[a * 3 + 1] - j[b * 3 + 1], j[a * 3 + 2] - j[b * 3 + 2]);
}

export function readJoint(h: HandSample, index: number, out: Point3): Point3 {
  out.x = h.joints[index * 3];
  out.y = h.joints[index * 3 + 1];
  out.z = h.joints[index * 3 + 2];
  return out;
}

/** Palm centre ≈ midpoint of the wrist and the middle finger's knuckle. */
export function palmCenter(h: HandSample, out: Point3): Point3 {
  const j = h.joints;
  const w = J.WRIST * 3;
  const m = J.MIDDLE_PROX * 3;
  out.x = (j[w] + j[m]) / 2;
  out.y = (j[w + 1] + j[m + 1]) / 2;
  out.z = (j[w + 2] + j[m + 2]) / 2;
  return out;
}

/** Midpoint between thumb tip and index tip. */
export function pinchPoint(h: HandSample, out: Point3): Point3 {
  const j = h.joints;
  const t = J.THUMB_TIP * 3;
  const i = J.INDEX_TIP * 3;
  out.x = (j[t] + j[i]) / 2;
  out.y = (j[t + 1] + j[i + 1]) / 2;
  out.z = (j[t + 2] + j[i + 2]) / 2;
  return out;
}

export function pointDistance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** [knuckle, tip] for the four non-thumb fingers. */
const FINGERS: ReadonlyArray<readonly [number, number]> = [
  [J.INDEX_PROX, J.INDEX_TIP],
  [J.MIDDLE_PROX, J.MIDDLE_TIP],
  [J.RING_PROX, J.RING_TIP],
  [J.PINKY_PROX, J.PINKY_TIP],
];

/**
 * tip→wrist ÷ knuckle→wrist. About 1.8–2.0 for a straight finger, below ~1.1
 * when the finger is curled into the palm. Independent of hand size.
 */
export function curlRatio(h: HandSample, knuckle: number, tip: number): number {
  return jointDistance(h, tip, J.WRIST) / Math.max(jointDistance(h, knuckle, J.WRIST), 1e-4);
}

export const FIST_RATIO = 1.15;

/** All four fingers curled. A pinch leaves the other fingers open, so it is not a fist. */
export function isFist(h: HandSample): boolean {
  if (!h.tracked) return false;
  for (const [k, t] of FINGERS) if (curlRatio(h, k, t) >= FIST_RATIO) return false;
  return true;
}

export type PinchEvent = 'start' | 'end' | null;

/** Thumb–index pinch with hysteresis (on < 1.8 cm, off > 3.0 cm). */
export class PinchDetector {
  pinching = false;
  lastDistance = Number.NaN;

  constructor(
    public onDistance = 0.018,
    public offDistance = 0.03,
  ) {}

  update(h: HandSample): PinchEvent {
    if (!h.tracked) {
      this.lastDistance = Number.NaN;
      if (this.pinching) {
        this.pinching = false;
        return 'end';
      }
      return null;
    }
    const d = jointDistance(h, J.THUMB_TIP, J.INDEX_TIP);
    this.lastDistance = d;
    if (!this.pinching && d < this.onDistance) {
      this.pinching = true;
      return 'start';
    }
    if (this.pinching && d > this.offDistance) {
      this.pinching = false;
      return 'end';
    }
    return null;
  }
}

/**
 * Fist held for `holdMs` completes a cast. Releasing early cancels. After a
 * cast the hand must open before it can cast again. Brief tracking loss
 * (< graceMs, common when fingers occlude each other in a fist) is tolerated.
 */
export class FistHold {
  progress = 0;
  private startedAt = -1;
  private lostAt = -1;
  private fired = false;

  constructor(
    public holdMs = 350,
    public graceMs = 150,
  ) {}

  update(h: HandSample, nowMs: number): boolean {
    if (!h.tracked) {
      if (this.startedAt >= 0) {
        if (this.lostAt < 0) this.lostAt = nowMs;
        if (nowMs - this.lostAt < this.graceMs) return false;
      }
      this.reset();
      return false;
    }
    this.lostAt = -1;

    if (!isFist(h)) {
      this.reset();
      return false;
    }
    if (this.fired) {
      this.progress = 0;
      return false;
    }
    if (this.startedAt < 0) this.startedAt = nowMs;
    this.progress = Math.min(1, (nowMs - this.startedAt) / this.holdMs);
    if (this.progress >= 1) {
      this.fired = true;
      this.progress = 0;
      return true;
    }
    return false;
  }

  private reset(): void {
    this.startedAt = -1;
    this.lostAt = -1;
    this.fired = false;
    this.progress = 0;
  }
}

/**
 * One-hand summon (accessibility): a pinch held still for `holdMs`.
 * Moving the pinch more than `maxDrift` restarts the timer.
 */
export class PinchHold {
  progress = 0;
  private startedAt = -1;
  private fired = false;
  private start: Point3 = { x: 0, y: 0, z: 0 };
  private current: Point3 = { x: 0, y: 0, z: 0 };

  constructor(
    public holdMs = 1000,
    public maxDrift = 0.03,
  ) {}

  update(h: HandSample, pinching: boolean, nowMs: number): boolean {
    if (!h.tracked || !pinching || isFist(h)) {
      this.startedAt = -1;
      this.fired = false;
      this.progress = 0;
      return false;
    }
    pinchPoint(h, this.current);
    if (this.startedAt < 0 || pointDistance(this.current, this.start) > this.maxDrift) {
      this.startedAt = nowMs;
      this.start.x = this.current.x;
      this.start.y = this.current.y;
      this.start.z = this.current.z;
    }
    if (this.fired) return false;
    this.progress = Math.min(1, (nowMs - this.startedAt) / this.holdMs);
    if (this.progress >= 1) {
      this.fired = true;
      this.progress = 0;
      return true;
    }
    return false;
  }
}

export type ClapPhase = 'idle' | 'near' | 'resting' | 'cooldown';

/**
 * Clap-and-pull-apart (summon the staff).
 *
 * Palms come within `nearDistance` (or tracking drops for ≤ `lossGraceMs`
 * while they were within `looseDistance` — hands overlapping often lose
 * tracking), then separate past `separateDistance` within `windowMs` of the
 * last contact. Hands held together longer than `maxContactMs` count as
 * resting, not clapping, and must move apart before another clap can start.
 */
export class ClapDetector {
  nearDistance = 0.08;
  looseDistance = 0.12;
  lossGraceMs = 300;
  separateDistance = 0.25;
  windowMs = 1500;
  maxContactMs = 1500;
  restReleaseDistance = 0.15;
  cooldownMs = 400;

  phase: ClapPhase = 'idle';
  /** Latest palm distance in metres, NaN when either hand is not tracked. */
  palmDistance = Number.NaN;

  private contactStart = -1;
  private lastNear = -1;
  private lastDistance = Number.POSITIVE_INFINITY;
  private lastBothAt = Number.NEGATIVE_INFINITY;
  private cooldownUntil = 0;
  private pl: Point3 = { x: 0, y: 0, z: 0 };
  private pr: Point3 = { x: 0, y: 0, z: 0 };

  update(left: HandSample, right: HandSample, nowMs: number): boolean {
    if (this.phase === 'cooldown') {
      if (nowMs < this.cooldownUntil) {
        this.palmDistance = this.measure(left, right);
        return false;
      }
      this.phase = 'idle';
    }

    const both = left.tracked && right.tracked;
    if (both) {
      const d = this.measure(left, right);
      this.lastDistance = d;
      this.lastBothAt = nowMs;

      switch (this.phase) {
        case 'idle':
          if (d < this.nearDistance) this.enterNear(nowMs);
          break;
        case 'near':
          if (d < this.nearDistance) {
            this.lastNear = nowMs;
            if (nowMs - this.contactStart > this.maxContactMs) this.phase = 'resting';
          } else if (d > this.separateDistance) {
            if (nowMs - this.lastNear <= this.windowMs) {
              this.phase = 'cooldown';
              this.cooldownUntil = nowMs + this.cooldownMs;
              return true;
            }
            this.phase = 'idle';
          } else if (nowMs - this.lastNear > this.windowMs) {
            this.phase = 'idle';
          }
          break;
        case 'resting':
          if (d > this.restReleaseDistance) this.phase = 'idle';
          break;
      }
      return false;
    }

    this.palmDistance = Number.NaN;
    if (
      this.phase === 'idle' &&
      this.lastDistance < this.looseDistance &&
      nowMs - this.lastBothAt <= this.lossGraceMs
    ) {
      this.enterNear(nowMs);
    } else if (this.phase === 'near' && nowMs - this.lastNear > this.windowMs) {
      this.phase = 'idle';
    }
    return false;
  }

  private enterNear(nowMs: number): void {
    this.phase = 'near';
    this.contactStart = nowMs;
    this.lastNear = nowMs;
  }

  private measure(left: HandSample, right: HandSample): number {
    if (!left.tracked || !right.tracked) return Number.NaN;
    palmCenter(left, this.pl);
    palmCenter(right, this.pr);
    this.palmDistance = pointDistance(this.pl, this.pr);
    return this.palmDistance;
  }
}
