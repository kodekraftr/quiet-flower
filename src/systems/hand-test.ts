/**
 * Live hand readout for the /test page (test.html). For each hand: how far the
 * palm is from the midpoint of both palms (left/right, up/down, forward/back
 * along the way you face), which fingers are open, and FIST.
 * Shown on a panel in front of you in VR and in the page's #hand-left /
 * #hand-right / #hand-apart elements.
 */

import { createSystem } from '@iwsdk/core';
import { Vector3 } from 'three';
import { FINGER_NAMES, fingerStates, handOffset } from '../input/hand-pose.js';
import { isFist, pointDistance, type Point3 } from '../input/gestures.js';
import { hands, type HandGestureState, type Handedness } from '../input/hand-state.js';
import { CanvasText } from '../scene/canvas-text.js';
import { getViewer } from '../scene/viewer.js';

const REFRESH_MS = 100;

function signed(cm: number, plus: string, minus: string): string {
  return `${Math.abs(cm).toFixed(1)} cm ${cm >= 0 ? plus : minus}`;
}

export class HandTestSystem extends createSystem({}) {
  private readonly panel = new CanvasText(0.6, 0.42, 1500, 1050, { background: 'rgba(11,16,22,0.85)', align: 'left' });
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly mid: Point3 = { x: 0, y: 0, z: 0 };
  private readonly offset: Record<Handedness, Point3> = { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } };
  private readonly fingers: Record<Handedness, boolean[]> = { left: [false, false, false, false, false], right: [false, false, false, false, false] };
  private both = false;
  private lastDraw = 0;
  private dom: { left: HTMLElement | null; right: HTMLElement | null; apart: HTMLElement | null } = { left: null, right: null, apart: null };

  init(): void {
    this.scene.add(this.panel.mesh);
    this.cleanupFuncs.push(() => this.panel.mesh.removeFromParent());
    this.dom = {
      left: document.getElementById('hand-left'),
      right: document.getElementById('hand-right'),
      apart: document.getElementById('hand-apart'),
    };
  }

  update(): void {
    getViewer(this.world, this.eye, this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    // Right = forward × up, kept horizontal.
    this.right.set(-this.forward.z, 0, this.forward.x);

    const m = this.panel.mesh;
    // Outside VR the page shows the same text, so the panel would only be clutter behind it.
    m.visible = this.world.session != null;
    // At eye level, above where the hands are held, so it never covers them.
    m.position.copy(this.eye).addScaledVector(this.forward, 0.7);
    m.position.y = this.eye.y + 0.02;
    m.lookAt(this.eye);

    const l = hands.left;
    const r = hands.right;
    this.both = l.sample.tracked && r.sample.tracked;
    if (this.both) {
      this.mid.x = (l.palm.x + r.palm.x) / 2;
      this.mid.y = (l.palm.y + r.palm.y) / 2;
      this.mid.z = (l.palm.z + r.palm.z) / 2;
      handOffset(l.palm, this.mid, this.right, this.forward, this.offset.left);
      handOffset(r.palm, this.mid, this.right, this.forward, this.offset.right);
    }
    if (l.sample.tracked) fingerStates(l.sample, this.fingers.left);
    if (r.sample.tracked) fingerStates(r.sample, this.fingers.right);

    const now = performance.now();
    if (now - this.lastDraw < REFRESH_MS) return;
    this.lastDraw = now;

    const left = this.describe('left', l);
    const right = this.describe('right', r);
    const apart = this.both ? `Hands apart: ${(pointDistance(l.palm, r.palm) * 100).toFixed(1)} cm` : 'Hands apart: –';
    this.panel.set(`${left}\n\n${right}\n\n${apart}`, '#E8EEF5');
    if (this.dom.left) this.dom.left.textContent = left;
    if (this.dom.right) this.dom.right.textContent = right;
    if (this.dom.apart) this.dom.apart.textContent = apart;
  }

  private describe(key: Handedness, h: HandGestureState): string {
    const title = `${key.toUpperCase()} HAND`;
    if (!h.sample.tracked) return `${title}\nnot tracked\n\n\n`;
    const o = this.offset[key];
    const move = this.both
      ? `${signed(o.x * 100, 'right', 'left')} · ${signed(o.y * 100, 'up', 'down')} · ${signed(o.z * 100, 'forward', 'back')}`
      : '– (needs both hands)';
    const f = this.fingers[key];
    const open = f.filter(Boolean).length;
    const openNames = FINGER_NAMES.filter((_, i) => f[i]).join(', ') || '–';
    const closedNames = FINGER_NAMES.filter((_, i) => !f[i]).join(', ') || '–';
    const summary = isFist(h.sample) ? 'FIST' : `${open} open / ${5 - open} closed`;
    return `${title}  ${summary}\n${move}\nOpen: ${openNames}\nClosed: ${closedNames}`;
  }
}
