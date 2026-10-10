/**
 * Head-direction targeting for Rise (build spec §4, decision #4). Quest 3/3S
 * don't give web apps eye tracking, so the target is whatever Liftable is
 * closest to the centre of view, within a cone widened by the object's
 * radius, held for a short dwell so it doesn't flicker.
 */

import { createSystem } from '@iwsdk/core';
import { Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { Liftable } from '../game-components.js';
import { baked } from '../scene/baked.js';
import { getViewer } from '../scene/viewer.js';

const MAX_ANGLE = (12 * Math.PI) / 180;
const MAX_DISTANCE = 6;
const DWELL_MS = 150;
const HIGHLIGHT = new Color(0x2fb3a6);
const NO_EMISSIVE = new Color(0x000000);
// Baked (unlit) objects can't glow, so they're tinted teal and brightened instead.
const BAKED_TINT = new Color(0.75, 1.35, 1.3);

export const targeting: { current: Object3D | null } = { current: null };

function setHighlight(object: Object3D | null, on: boolean): void {
  object?.traverse((child) => {
    if (child instanceof Mesh && baked.has(child.material)) {
      baked.setTint(child.material, on ? BAKED_TINT : null);
    } else if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
      child.material.emissive.copy(on ? HIGHLIGHT : NO_EMISSIVE);
      child.material.emissiveIntensity = on ? 0.55 : 1;
    }
  });
}

export class TargetingSystem extends createSystem({ liftables: { required: [Liftable] } }) {
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private readonly center = new Vector3();
  private readonly toObject = new Vector3();
  private candidate: Object3D | null = null;
  private candidateSince = 0;

  update(): void {
    getViewer(this.world, this.eye, this.forward);
    let best: Object3D | null = null;
    let bestScore = MAX_ANGLE;

    for (const entity of this.queries.liftables.entities) {
      const object = entity.object3D;
      if (!object) continue;
      object.getWorldPosition(this.center);
      this.toObject.subVectors(this.center, this.eye);
      const distance = this.toObject.length();
      if (distance < 0.05 || distance > MAX_DISTANCE) continue;
      const radius = entity.getValue(Liftable, 'radius') ?? 0.25;
      const score = this.forward.angleTo(this.toObject) - Math.atan2(radius, distance);
      if (score < bestScore) {
        bestScore = score;
        best = object;
      }
    }

    const now = performance.now();
    if (best !== this.candidate) {
      this.candidate = best;
      this.candidateSince = now;
    }
    if (this.candidate !== targeting.current && now - this.candidateSince >= DWELL_MS) {
      setHighlight(targeting.current, false);
      setHighlight(this.candidate, true);
      targeting.current = this.candidate;
    }
  }
}
