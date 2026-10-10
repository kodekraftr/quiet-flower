/**
 * Reads all 25 joints of each tracked hand from the live XRFrame and runs the
 * gesture detectors. Registered at priority -3: after IWSDK's input system
 * (-4), before everything that reacts to gestures.
 */

import { createSystem, VisibilityState } from '@iwsdk/core';
import { settings } from '../config.js';
import {
  ClapDetector,
  FistHold,
  J,
  JOINT_COUNT,
  JOINT_NAMES,
  PinchDetector,
  PinchHold,
  palmCenter,
  pinchPoint,
  readJoint,
} from '../input/gestures.js';
import { frameGestures, HANDEDNESS, hands, type Handedness } from '../input/hand-state.js';

type FrameWithHands = XRFrame & {
  fillPoses?: (spaces: Iterable<XRSpace>, baseSpace: XRSpace, transforms: Float32Array) => boolean;
  getJointPose?: (joint: XRJointSpace, baseSpace: XRSpace) => XRJointPose | undefined;
};

export class HandInputSystem extends createSystem({}) {
  private readonly jointSpaces = new WeakMap<XRHand, XRJointSpace[]>();
  private readonly poses = new Float32Array(16 * JOINT_COUNT);
  private readonly pinch: Record<Handedness, PinchDetector> = { left: new PinchDetector(), right: new PinchDetector() };
  private readonly fist: Record<Handedness, FistHold> = {
    left: new FistHold(settings.castHoldMs),
    right: new FistHold(settings.castHoldMs),
  };
  private readonly hold: Record<Handedness, PinchHold> = { left: new PinchHold(), right: new PinchHold() };
  private readonly clap = new ClapDetector();

  update(): void {
    const now = performance.now();
    this.readJoints();

    // System menu open (Meta button): treat hands as absent so nothing triggers.
    if (this.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      hands.left.sample.tracked = false;
      hands.right.sample.tracked = false;
    }

    for (const key of HANDEDNESS) {
      const h = hands[key];
      const s = h.sample;
      const event = this.pinch[key].update(s);
      h.pinchStarted = event === 'start';
      h.pinchEnded = event === 'end';
      h.pinching = this.pinch[key].pinching;
      h.pinchDistance = this.pinch[key].lastDistance;
      if (s.tracked) {
        pinchPoint(s, h.pinchPoint);
        palmCenter(s, h.palm);
        readJoint(s, J.INDEX_TIP, h.indexTip);
      }
      h.castCompleted = this.fist[key].update(s, now);
      h.fistProgress = this.fist[key].progress;
      h.holdSummon = settings.summon === 'hold' && this.hold[key].update(s, h.pinching, now);
      h.holdProgress = settings.summon === 'hold' ? this.hold[key].progress : 0;
    }

    frameGestures.clapped = this.clap.update(hands.left.sample, hands.right.sample, now);
    frameGestures.palmDistance = this.clap.palmDistance;
    frameGestures.clapPhase = this.clap.phase;
  }

  private readJoints(): void {
    hands.left.sample.tracked = false;
    hands.right.sample.tracked = false;
    const frame = this.world.xrFrame as FrameWithHands | null;
    const ref = this.world.xrReferenceSpace;
    if (!frame || !ref) return;

    // Joint poses are relative to the reference space, i.e. the player rig.
    this.player.updateMatrixWorld();
    const e = this.player.matrixWorld.elements;

    for (const source of frame.session.inputSources) {
      const hand = source.hand;
      const key = source.handedness;
      if (!hand || (key !== 'left' && key !== 'right')) continue;
      const spaces = this.spacesFor(hand);
      if (!spaces || !this.fillPoses(frame, spaces, ref)) continue;

      const out = hands[key].sample.joints;
      for (let i = 0; i < JOINT_COUNT; i++) {
        const x = this.poses[i * 16 + 12];
        const y = this.poses[i * 16 + 13];
        const z = this.poses[i * 16 + 14];
        out[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        out[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        out[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      hands[key].sample.tracked = true;
    }
  }

  private spacesFor(hand: XRHand): XRJointSpace[] | null {
    let spaces = this.jointSpaces.get(hand);
    if (!spaces) {
      const list: XRJointSpace[] = [];
      for (const name of JOINT_NAMES) {
        const space = hand.get(name as XRHandJoint);
        if (!space) return null;
        list.push(space);
      }
      spaces = list;
      this.jointSpaces.set(hand, spaces);
    }
    return spaces;
  }

  private fillPoses(frame: FrameWithHands, spaces: XRJointSpace[], ref: XRReferenceSpace): boolean {
    if (typeof frame.fillPoses === 'function') return frame.fillPoses(spaces, ref, this.poses);
    if (typeof frame.getJointPose !== 'function') return false;
    for (let i = 0; i < spaces.length; i++) {
      const pose = frame.getJointPose(spaces[i], ref);
      if (!pose) return false;
      this.poses.set(pose.transform.matrix, i * 16);
    }
    return true;
  }
}
