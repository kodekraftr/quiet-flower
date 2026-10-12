/**
 * Live hand readout for the /test page (test.html). Bring both palms together
 * and hold for a second to fix 0,0,0 there (and the x/y/z axes to the way you
 * face at that moment). Then for each hand: palm position from 0,0,0 in cm
 * (x+ right, y+ up, z+ forward), which fingers are open, and FIST.
 * Shown on a panel in front of you in VR and in the page's #hand-left /
 * #hand-right / #zero-status elements.
 */

import { createSystem } from '@iwsdk/core';
import { Vector3 } from 'three';
import { FINGER_NAMES, fingerStates, handOffset, ZeroHold } from '../input/hand-pose.js';
import { isFist, pointDistance, type Point3 } from '../input/gestures.js';
import { hands, type HandGestureState, type Handedness } from '../input/hand-state.js';
import { CanvasText } from '../scene/canvas-text.js';
import { getViewer } from '../scene/viewer.js';

const REFRESH_MS = 100;

/** cm with an explicit sign, e.g. "+4.0", "−12.3". */
function signedCm(m: number): string {
  const cm = m * 100;
  return `${cm < -0.05 ? '−' : '+'}${Math.abs(cm).toFixed(1)}`;
}

export class HandTestSystem extends createSystem({}) {
  private readonly panel = new CanvasText(0.6, 0.42, 1500, 1050, { background: 'rgba(11,16,22,0.85)', align: 'left' });
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private readonly zero = new ZeroHold();
  /** 0,0,0 and the axes, fixed when the palms-together hold completes. */
  private readonly origin: Point3 = { x: 0, y: 0, z: 0 };
  private readonly axisRight: Point3 = { x: 1, y: 0, z: 0 };
  private readonly axisForward: Point3 = { x: 0, y: 0, z: -1 };
  private hasOrigin = false;
  private readonly offset: Record<Handedness, Point3> = { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } };
  private readonly fingers: Record<Handedness, boolean[]> = { left: [false, false, false, false, false], right: [false, false, false, false, false] };
  private lastDraw = 0;
  private dom: { left: HTMLElement | null; right: HTMLElement | null; status: HTMLElement | null } = { left: null, right: null, status: null };

  init(): void {
    this.scene.add(this.panel.mesh);
    this.cleanupFuncs.push(() => this.panel.mesh.removeFromParent());
    this.dom = {
      left: document.getElementById('hand-left'),
      right: document.getElementById('hand-right'),
      status: document.getElementById('zero-status'),
    };
  }

  update(): void {
    const now = performance.now();
    getViewer(this.world, this.eye, this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();

    const m = this.panel.mesh;
    // Outside VR the page shows the same text, so the panel would only be clutter behind it.
    m.visible = this.world.session != null;
    // At eye level, above where the hands are held, so it never covers them.
    m.position.copy(this.eye).addScaledVector(this.forward, 0.7);
    m.position.y = this.eye.y + 0.02;
    m.lookAt(this.eye);

    const l = hands.left;
    const r = hands.right;
    const both = l.sample.tracked && r.sample.tracked;
    if (this.zero.update(both ? pointDistance(l.palm, r.palm) : Number.NaN, now)) {
      this.origin.x = (l.palm.x + r.palm.x) / 2;
      this.origin.y = (l.palm.y + r.palm.y) / 2;
      this.origin.z = (l.palm.z + r.palm.z) / 2;
      this.axisForward.x = this.forward.x;
      this.axisForward.z = this.forward.z;
      // Right = forward × up, kept horizontal.
      this.axisRight.x = -this.forward.z;
      this.axisRight.z = this.forward.x;
      this.hasOrigin = true;
    }
    for (const key of ['left', 'right'] as const) {
      const h = hands[key];
      if (!h.sample.tracked) continue;
      fingerStates(h.sample, this.fingers[key]);
      if (this.hasOrigin) handOffset(h.palm, this.origin, this.axisRight, this.axisForward, this.offset[key]);
    }

    if (now - this.lastDraw < REFRESH_MS) return;
    this.lastDraw = now;

    const left = this.describe('left', l);
    const right = this.describe('right', r);
    const status = this.zero.progress > 0
      ? `Setting 0,0,0… ${Math.round(this.zero.progress * 100)}%`
      : this.hasOrigin
        ? '0,0,0 set · x+ right · y+ up · z+ forward\nPalms together for 1 s to re-zero'
        : '0,0,0 not set\nBring your palms together and hold for 1 s';
    this.panel.set(`${status}\n\n${left}\n\n${right}`, '#E8EEF5');
    if (this.dom.left) this.dom.left.textContent = left;
    if (this.dom.right) this.dom.right.textContent = right;
    if (this.dom.status) this.dom.status.textContent = status;
  }

  private describe(key: Handedness, h: HandGestureState): string {
    const title = `${key.toUpperCase()} HAND`;
    if (!h.sample.tracked) return `${title}\nnot tracked\n\n\n`;
    const o = this.offset[key];
    const position = this.hasOrigin ? `x ${signedCm(o.x)}   y ${signedCm(o.y)}   z ${signedCm(o.z)} cm` : 'x –   y –   z –';
    const f = this.fingers[key];
    const open = f.filter(Boolean).length;
    const openNames = FINGER_NAMES.filter((_, i) => f[i]).join(', ') || '–';
    const closedNames = FINGER_NAMES.filter((_, i) => !f[i]).join(', ') || '–';
    const summary = isFist(h.sample) ? 'FIST' : `${open} open / ${5 - open} closed`;
    return `${title}  ${summary}\n${position}\nOpen: ${openNames}\nClosed: ${closedNames}`;
  }
}
