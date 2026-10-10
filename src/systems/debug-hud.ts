/**
 * Live gesture readout for tuning on the headset (add ?debug=1 to the URL).
 * Shows pinch distance, fist progress, palm distance, clap phase, staff and
 * target state, and frame rate. Floats just below your line of sight.
 */

import { createSystem } from '@iwsdk/core';
import { Vector3 } from 'three';
import { settings } from '../config.js';
import { melodyNames } from '../game/notes.js';
import { frameGestures, hands, type HandGestureState } from '../input/hand-state.js';
import { CanvasText } from '../scene/canvas-text.js';
import { getViewer } from '../scene/viewer.js';
import { staffState } from './staff-state.js';
import { targeting } from './targeting.js';

const REFRESH_MS = 120;

function handLine(name: string, h: HandGestureState): string {
  if (!h.sample.tracked) return `${name}  –`;
  const pinch = Number.isFinite(h.pinchDistance) ? `${(h.pinchDistance * 100).toFixed(1)}cm` : '–';
  return `${name}  pinch ${pinch}${h.pinching ? '●' : ''}  fist ${Math.round(h.fistProgress * 100)}%`;
}

export class DebugHudSystem extends createSystem({}) {
  private readonly text = new CanvasText(0.5, 0.15, 1100, 330, { background: 'rgba(0,0,0,0.6)', align: 'left' });
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private lastDraw = 0;
  private frames = 0;
  private fps = 0;
  private fpsSince = performance.now();

  init(): void {
    this.scene.add(this.text.mesh);
    this.cleanupFuncs.push(() => this.text.mesh.removeFromParent());
  }

  update(): void {
    const now = performance.now();
    this.frames++;
    if (now - this.fpsSince >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsSince));
      this.frames = 0;
      this.fpsSince = now;
    }

    getViewer(this.world, this.eye, this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    const m = this.text.mesh;
    m.position.copy(this.eye).addScaledVector(this.forward, 0.7);
    m.position.y = this.eye.y - 0.42;
    m.lookAt(this.eye);

    if (now - this.lastDraw < REFRESH_MS) return;
    this.lastDraw = now;
    const palms = Number.isFinite(frameGestures.palmDistance) ? `${Math.round(frameGestures.palmDistance * 100)}cm` : '–';
    const melody = staffState.melody.length ? melodyNames(staffState.melody, settings.notation) : '–';
    this.text.set(
      [
        `${handLine('L', hands.left)}    ${handLine('R', hands.right)}`,
        `palms ${palms}  clap ${frameGestures.clapPhase}  staff ${staffState.open ? 'open' : 'closed'}  melody ${melody}`,
        `target ${targeting.current?.name || '–'}   ${this.fps} fps`,
      ].join('\n'),
      '#E8EEF5',
    );
  }
}
