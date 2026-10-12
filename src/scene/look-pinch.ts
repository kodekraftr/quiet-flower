/**
 * "Look at it and pinch" for things out of arm's reach (the bag, a scrap on
 * the floor, the cart's rim). Quest 3/3S don't give web apps eye tracking, so
 * "look" is head direction: within a small cone, held for a short dwell. A
 * soft gold glow marks it while it's looked at; a pinch with either hand then
 * triggers it.
 */

import type { World } from '@iwsdk/core';
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';
import { HANDEDNESS, hands } from '../input/hand-state.js';
import { getViewer } from './viewer.js';

const DWELL_MS = 150;

let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(247,210,122,0.85)');
  grad.addColorStop(0.5, 'rgba(247,210,122,0.25)');
  grad.addColorStop(1, 'rgba(247,210,122,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  glowTex.colorSpace = SRGBColorSpace;
  return glowTex;
}

export class LookPinch {
  readonly glow = new Sprite(new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, transparent: true, depthWrite: false }));
  enabled = true;
  private since = -1;
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private readonly to = new Vector3();

  /**
   * @param target  world point to look at (kept by reference: move it freely)
   * @param size    glow size in metres
   * @param angle   look cone half-angle, radians
   */
  constructor(readonly target: Vector3, size: number, private readonly angle = (16 * Math.PI) / 180) {
    this.glow.position.copy(target);
    this.glow.scale.setScalar(size);
    this.glow.visible = false;
  }

  /** Returns true on the frame the player pinches while looking at the target. */
  update(world: World, now: number): boolean {
    this.glow.position.copy(this.target);
    if (!this.enabled) {
      this.glow.visible = false;
      this.since = -1;
      return false;
    }
    getViewer(world, this.eye, this.forward);
    this.to.subVectors(this.target, this.eye);
    const looking = this.forward.angleTo(this.to) < this.angle;
    if (looking && this.since < 0) this.since = now;
    if (!looking) this.since = -1;
    const lit = this.since >= 0 && now - this.since >= DWELL_MS;
    this.glow.visible = lit;
    if (!lit) return false;
    this.glow.material.opacity = 0.6 + 0.3 * Math.sin(now / 220);
    for (const key of HANDEDNESS) if (hands[key].pinchStarted) return true;
    return false;
  }
}
