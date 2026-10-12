/**
 * The hearing rule in the world (build spec §5, storyboard "Hear" step).
 * Every listener carries an ear marker: a glowing ear when they can hear the
 * player right now, a struck-out ear with the reason (door, noise, earmuffs,
 * too far) when they can't. When a listener spell lands, `hearing.cast()`
 * applies the rule and fires `heard` for each listener who heard it.
 */

import { createSystem, type Entity } from '@iwsdk/core';
import { Box3, CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';
import { canHear, type DeafReason, type NoiseSource as NoiseData, type SoundBlocker as BlockerData } from '../game/hearing.js';
import type { SpellId } from '../game/spells.js';
import { Listener, NoiseSource, SoundBlocker } from '../game-components.js';
import { getViewer } from '../scene/viewer.js';
import { game } from './progress-state.js';

type MarkerState = 'hears' | DeafReason | 'asleep';

const STATES: readonly MarkerState[] = ['hears', 'door', 'noise', 'earmuffs', 'distance', 'asleep'];
const REFRESH_MS = 200;
const MARKER_SIZE = 0.2;
const PULSE_MS = 900;
/** Ear height below the marker. */
const EAR_DROP = 0.45;

const GOLD = '#F7D27A';
const GREY = '#8A96A6';
const RED = '#E0664F';

/** One 128×128 icon per state, drawn once. */
function drawMarker(state: MarkerState): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const hears = state === 'hears';
  g.fillStyle = 'rgba(8,12,18,0.72)';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.strokeStyle = hears ? GOLD : GREY;
  if (hears) {
    g.shadowColor = GOLD;
    g.shadowBlur = 14;
  }
  // The ear: an outer C, and an inner curl.
  g.beginPath();
  g.arc(64, 54, 26, Math.PI * 1.05, Math.PI * 0.35);
  g.quadraticCurveTo(70, 92, 56, 98);
  g.stroke();
  g.beginPath();
  g.arc(64, 55, 11, Math.PI * 1.1, Math.PI * 0.2);
  g.stroke();
  g.shadowBlur = 0;
  if (state === 'asleep') {
    g.fillStyle = GREY;
    g.font = '700 30px system-ui, sans-serif';
    g.fillText('z', 88, 40);
    g.font = '700 22px system-ui, sans-serif';
    g.fillText('z', 102, 24);
  } else if (!hears) {
    g.strokeStyle = RED;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(30, 98);
    g.lineTo(98, 30);
    g.stroke();
    // Why: a small glyph in the lower right.
    g.fillStyle = 'rgba(8,12,18,0.92)';
    g.beginPath();
    g.arc(98, 98, 26, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#E8EEF5';
    g.lineWidth = 4;
    g.beginPath();
    switch (state) {
      case 'door':
        g.rect(88, 82, 20, 32);
        g.moveTo(103, 99);
        g.lineTo(103, 100);
        break;
      case 'noise':
        for (let k = 0; k < 2; k++) {
          const y = 92 + k * 12;
          g.moveTo(80, y);
          g.bezierCurveTo(88, y - 8, 96, y + 8, 104, y);
          g.bezierCurveTo(108, y - 4, 112, y - 4, 116, y);
        }
        break;
      case 'earmuffs':
        g.arc(98, 100, 14, Math.PI, 0);
        g.moveTo(86, 104);
        g.arc(86, 104, 5, 0, Math.PI * 2);
        g.moveTo(115, 104);
        g.arc(110, 104, 5, 0, Math.PI * 2);
        break;
      default: // distance: an arrow pointing away
        g.moveTo(82, 98);
        g.lineTo(114, 98);
        g.moveTo(105, 89);
        g.lineTo(114, 98);
        g.lineTo(105, 107);
        break;
    }
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Marker {
  sprite: Sprite;
  state: MarkerState | null;
  pulseAt: number;
}

export interface CastHearing {
  heard: Entity[];
  /** Listeners who could not hear, with why. */
  missed: { listener: Entity; reason: DeafReason }[];
}

/** Filled in by HearingSystem.init(). */
export const hearing = {
  cast: (_spell: SpellId | 'free'): CastHearing => ({ heard: [], missed: [] }),
  /** Mark a listener asleep (their marker shows z z instead of an ear). */
  setAsleep: (_listener: Entity, _asleep: boolean): void => {},
};

export class HearingSystem extends createSystem({
  listeners: { required: [Listener] },
  blockers: { required: [SoundBlocker] },
  noises: { required: [NoiseSource] },
}) {
  private readonly materials = new Map<MarkerState, SpriteMaterial>();
  private readonly markers = new Map<Entity, Marker>();
  private readonly asleep = new Set<Entity>();
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private readonly ears = new Vector3();
  private readonly box = new Box3();
  private readonly blockerPool: BlockerData[] = [];
  private readonly noisePool: NoiseData[] = [];
  private readonly blockerList: BlockerData[] = [];
  private readonly noiseList: NoiseData[] = [];
  private readonly listenerData = { position: { x: 0, y: 0, z: 0 }, earmuffs: false };
  private lastRefresh = 0;

  init(): void {
    for (const s of STATES) {
      this.materials.set(s, new SpriteMaterial({ map: drawMarker(s), transparent: true, depthWrite: false }));
    }
    this.queries.listeners.subscribe('qualify', (entity) => {
      const sprite = new Sprite(this.materials.get('hears'));
      sprite.scale.setScalar(MARKER_SIZE);
      sprite.renderOrder = 5;
      this.scene.add(sprite);
      this.markers.set(entity, { sprite, state: null, pulseAt: -Infinity });
    });
    this.queries.listeners.subscribe('disqualify', (entity) => {
      this.markers.get(entity)?.sprite.removeFromParent();
      this.markers.delete(entity);
      this.asleep.delete(entity);
    });
    hearing.cast = (spell) => this.cast(spell);
    hearing.setAsleep = (listener, asleep) => {
      if (asleep) this.asleep.add(listener);
      else this.asleep.delete(listener);
      this.lastRefresh = 0;
    };
    this.cleanupFuncs.push(() => {
      for (const m of this.markers.values()) m.sprite.removeFromParent();
      this.markers.clear();
    });
  }

  update(): void {
    const now = performance.now();
    for (const [entity, marker] of this.markers) {
      const o = entity.object3D;
      if (!o) continue;
      o.getWorldPosition(marker.sprite.position);
      marker.sprite.position.y += entity.getValue(Listener, 'markerHeight') ?? 2.1;
      const t = (now - marker.pulseAt) / PULSE_MS;
      marker.sprite.scale.setScalar(MARKER_SIZE * (t >= 0 && t < 1 ? 1 + 0.45 * Math.sin(t * Math.PI) : 1));
    }
    if (now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    this.gather();
    for (const [entity, marker] of this.markers) {
      const state: MarkerState = this.asleep.has(entity) ? 'asleep' : this.evaluate(entity);
      if (state !== marker.state) {
        marker.state = state;
        marker.sprite.material = this.materials.get(state)!;
      }
    }
  }

  private cast(spell: SpellId | 'free'): CastHearing {
    const result: CastHearing = { heard: [], missed: [] };
    this.gather();
    const now = performance.now();
    for (const [entity, marker] of this.markers) {
      marker.pulseAt = now;
      const state = this.evaluate(entity);
      if (state === 'hears') result.heard.push(entity);
      else result.missed.push({ listener: entity, reason: state });
    }
    this.lastRefresh = 0;
    for (const listener of result.heard) game.emit('heard', { spell, listener });
    return result;
  }

  /** Snapshot blockers and noises into reused objects (no allocation once warm). */
  private gather(): void {
    getViewer(this.world, this.eye, this.forward);
    this.blockerList.length = 0;
    let i = 0;
    for (const entity of this.queries.blockers.entities) {
      const o = entity.object3D;
      if (!o) continue;
      const b = (this.blockerPool[i] ??= { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, closed: true });
      i++;
      this.box.setFromObject(o);
      b.min.x = this.box.min.x;
      b.min.y = this.box.min.y;
      b.min.z = this.box.min.z;
      b.max.x = this.box.max.x;
      b.max.y = this.box.max.y;
      b.max.z = this.box.max.z;
      b.closed = entity.getValue(SoundBlocker, 'closed') ?? true;
      this.blockerList.push(b);
    }
    this.noiseList.length = 0;
    i = 0;
    for (const entity of this.queries.noises.entities) {
      const o = entity.object3D;
      if (!o) continue;
      const n = (this.noisePool[i] ??= { position: { x: 0, y: 0, z: 0 }, radius: 3, active: true });
      i++;
      o.getWorldPosition(this.ears);
      n.position.x = this.ears.x;
      n.position.y = this.ears.y;
      n.position.z = this.ears.z;
      n.radius = entity.getValue(NoiseSource, 'radius') ?? 3;
      n.active = entity.getValue(NoiseSource, 'active') ?? true;
      this.noiseList.push(n);
    }
  }

  private evaluate(entity: Entity): 'hears' | DeafReason {
    const o = entity.object3D;
    if (!o) return 'distance';
    o.getWorldPosition(this.ears);
    const l = this.listenerData;
    l.position.x = this.ears.x;
    l.position.y = this.ears.y + Math.max(0.2, (entity.getValue(Listener, 'markerHeight') ?? 2.1) - EAR_DROP);
    l.position.z = this.ears.z;
    l.earmuffs = entity.getValue(Listener, 'earmuffs') ?? false;
    const r = canHear(this.eye, l, this.blockerList, this.noiseList);
    return r.hears ? 'hears' : (r.reason ?? 'distance');
  }
}
