/**
 * Per-frame hand and gesture state, written by HandInputSystem (priority -3)
 * and read by later systems in the same frame. Edge flags (pinchStarted,
 * pinchEnded, castCompleted, holdSummon, clapped) are true for one frame only.
 */

import { createHandSample, type ClapPhase, type HandSample, type Point3 } from './gestures.js';

export type Handedness = 'left' | 'right';
export const HANDEDNESS: readonly Handedness[] = ['left', 'right'];

export interface HandGestureState {
  sample: HandSample;
  pinching: boolean;
  pinchStarted: boolean;
  pinchEnded: boolean;
  /** Thumb–index distance in metres, NaN when untracked (debug readout). */
  pinchDistance: number;
  pinchPoint: Point3;
  indexTip: Point3;
  palm: Point3;
  /** 0–1 while a fist is being held, for the cast ring. */
  fistProgress: number;
  castCompleted: boolean;
  /** 0–1 for the one-hand summon ring. */
  holdProgress: number;
  holdSummon: boolean;
}

function createHandState(): HandGestureState {
  return {
    sample: createHandSample(),
    pinching: false,
    pinchStarted: false,
    pinchEnded: false,
    pinchDistance: Number.NaN,
    pinchPoint: { x: 0, y: 0, z: 0 },
    indexTip: { x: 0, y: 0, z: 0 },
    palm: { x: 0, y: 0, z: 0 },
    fistProgress: 0,
    castCompleted: false,
    holdProgress: 0,
    holdSummon: false,
  };
}

export const hands: Record<Handedness, HandGestureState> = {
  left: createHandState(),
  right: createHandState(),
};

export const frameGestures: { clapped: boolean; palmDistance: number; clapPhase: ClapPhase } = {
  clapped: false,
  palmDistance: Number.NaN,
  clapPhase: 'idle',
};
