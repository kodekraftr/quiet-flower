/**
 * What happens after a cast: golden ripples spread from the player, then —
 * when the melody finishes playing — the spell or Curiosity lands.
 * Also runs ambient motion (lantern flicker, dust that slows with time).
 */

import { createSystem } from '@iwsdk/core';
import {
  AdditiveBlending,
  CircleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  type PlaneGeometry,
  type Object3D,
  type Points,
  RingGeometry,
  Vector3,
} from 'three';
import { synth } from '../audio/synth.js';
import { CURIOSITIES, type CastResult, type SpellId } from '../game/spells.js';
import { baked } from '../scene/baked.js';
import { CanvasText } from '../scene/canvas-text.js';
import { getViewer } from '../scene/viewer.js';
import { hearing } from './hearing.js';
import { foundCuriosity, game, progress } from './progress-state.js';
import { staffState } from './staff-state.js';

interface LiftState {
  baseY: number;
  height: number;
  lifted: boolean;
  t: number;
}

interface PendingCast {
  result: CastResult;
  target: Object3D | null;
  landsAt: number;
}

const refs: { lantern: Vector3 | null; pebble: Object3D | null; dust: Points | null } = {
  lantern: null,
  pebble: null,
  dust: null,
};
let pending: PendingCast | null = null;
let rippleRequested = false;
let liftResets: Object3D[] = [];
let clearLifts = false;
let captionRequest: { text: string; color: string; ms: number } | null = null;
let trembleMs = 0;

export const effects = {
  register(r: Partial<typeof refs>): void {
    Object.assign(refs, r);
  },
  /** Forget the current scene's objects (on unload). */
  clear(): void {
    refs.lantern = null;
    refs.pebble = null;
    refs.dust = null;
    pending = null;
    clearLifts = true;
    baked.clear();
  },
  /** A subtitle or story caption near where the player is looking. */
  say(text: string, color = HANDWRITING, ms = CAPTION_MS): void {
    captionRequest = { text, color, ms };
  },
  /** Put a lifted object straight back down (rewind). */
  resetLift(object: Object3D): void {
    liftResets.push(object);
  },
  /** The pebble trembles (the song hums by itself). */
  tremble(ms: number): void {
    trembleMs = ms;
  },
  /** Called when a cast completes; the effect lands when the melody has played. */
  cast(result: CastResult, target: Object3D | null, melodySeconds: number): void {
    pending = { result, target, landsAt: performance.now() + melodySeconds * 1000 };
    rippleRequested = true;
  },
};

const RIPPLES = 3;
const RIPPLE_MS = 1500;
const RIPPLE_STAGGER_MS = 220;
const CAPTION_MS = 2800;
const HANDWRITING = '#F3E6C4';
const GOLD = '#F7D27A';

export class EffectsSystem extends createSystem({}) {
  private readonly ripples: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
  private rippleStart = -Infinity;
  private readonly moths: Mesh[] = [];
  // 0.42 m wide at 0.75 m ≈ 31° of view: readable, well inside the Glasses' ~70° FOV.
  private readonly caption = new CanvasText(0.42, 0.052, 1100, 136, { background: 'rgba(8,12,18,0.72)' });
  private captionUntil = 0;
  private readonly lifts = new Map<Object3D, LiftState>();
  private flickerUntil = 0;
  private humUntil = 0;
  private mothsUntil = 0;
  private dustTime = 0;
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();

  init(): void {
    const ringGeo = new RingGeometry(0.28, 0.3, 72);
    for (let i = 0; i < RIPPLES; i++) {
      const ring = new Mesh(
        ringGeo,
        new MeshBasicMaterial({ color: 0xf7d27a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.scene.add(ring);
      this.ripples.push(ring);
    }
    const mothGeo = new CircleGeometry(0.012, 10);
    const mothMat = new MeshBasicMaterial({ color: 0xf3e6c4, side: DoubleSide });
    for (let i = 0; i < 3; i++) {
      const moth = new Mesh(mothGeo, mothMat);
      moth.visible = false;
      this.scene.add(moth);
      this.moths.push(moth);
    }
    this.caption.setOpacity(0);
    this.scene.add(this.caption.mesh);
    this.cleanupFuncs.push(() => {
      for (const o of [...this.ripples, ...this.moths, this.caption.mesh]) o.removeFromParent();
    });
  }

  update(delta: number, time: number): void {
    const now = performance.now();

    if (rippleRequested) {
      rippleRequested = false;
      getViewer(this.world, this.eye, this.forward);
      this.rippleStart = now;
      for (const r of this.ripples) r.position.set(this.eye.x, this.eye.y - 0.35, this.eye.z);
    }
    this.ripples.forEach((ring, i) => {
      const t = (now - this.rippleStart - i * RIPPLE_STAGGER_MS) / RIPPLE_MS;
      ring.visible = t >= 0 && t <= 1;
      if (ring.visible) {
        ring.scale.setScalar(1 + t * 14);
        ring.material.opacity = 0.55 * (1 - t);
      }
    });

    if (captionRequest) {
      const c = captionRequest;
      captionRequest = null;
      this.showCaption(c.text, c.color, now, c.ms);
    }
    if (clearLifts) {
      clearLifts = false;
      this.lifts.clear();
    }
    if (liftResets.length) {
      for (const o of liftResets) {
        const s = this.lifts.get(o);
        if (s) {
          o.position.y = s.baseY;
          s.t = 0;
          s.lifted = false;
        }
      }
      liftResets = [];
    }
    if (trembleMs > 0) {
      this.humUntil = now + trembleMs;
      trembleMs = 0;
    }

    if (pending && now >= pending.landsAt) {
      const p = pending;
      pending = null;
      this.land(p, now);
    }

    for (const [object, s] of this.lifts) {
      s.t = Math.min(1, Math.max(0, s.t + (s.lifted ? delta : -delta) / 1.1));
      const eased = s.t * s.t * (3 - 2 * s.t);
      const bob = s.t > 0.98 ? Math.sin(time * 1.7) * 0.008 : 0;
      object.position.y = s.baseY + eased * s.height + bob;
      const blob = object.userData.blob as Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
      if (blob) {
        blob.material.opacity = (object.userData.blobOpacity ?? 0.8) * (1 - 0.7 * eased);
        blob.scale.setScalar(1 + 0.5 * eased);
      }
    }

    // Lantern flicker: the light is baked, so dim the whole room's colour a touch.
    let light = 0.975 + 0.025 * Math.sin(time * 7.3) * Math.sin(time * 3.1);
    if (now < this.flickerUntil) light = Math.random() < 0.45 ? 0.45 : 1.04;
    baked.setLevel(light);

    if (refs.pebble) {
      refs.pebble.rotation.z = now < this.humUntil ? Math.sin(time * 45) * 0.12 * ((this.humUntil - now) / 1200) : 0;
    }

    const mothsOn = now < this.mothsUntil && refs.lantern !== null;
    if (mothsOn) getViewer(this.world, this.eye, this.forward);
    this.moths.forEach((moth, i) => {
      moth.visible = mothsOn;
      if (!mothsOn || !refs.lantern) return;
      const a = time * 2.2 + i * 2.09;
      const c = refs.lantern;
      moth.position.set(c.x + Math.cos(a) * 0.18, c.y + Math.sin(time * 3 + i) * 0.05, c.z + Math.sin(a) * 0.18);
      moth.lookAt(this.eye);
    });

    if (refs.dust) {
      this.dustTime += delta * staffState.timeScale;
      refs.dust.rotation.y = this.dustTime * 0.03;
      refs.dust.position.y = Math.sin(this.dustTime * 0.3) * 0.02;
    }

    const remaining = this.captionUntil - now;
    this.caption.setOpacity(remaining > 0 ? Math.min(1, remaining / 600) : 0);
  }

  private land(p: PendingCast, now: number): void {
    const r = p.result;
    game.emit('cast', { result: r });
    switch (r.kind) {
      case 'spell':
        if (r.spell.id === 'rise') {
          if (!p.target) {
            synth.thud();
            this.showCaption('Look at something to lift.', HANDWRITING, now);
            return;
          }
          const lifted = this.toggleLift(p.target);
          synth.chime();
          this.showCaption(lifted ? 'Rise' : 'Rise — set down', GOLD, now);
          game.emit('rise', { target: p.target, lifted });
        } else {
          this.reachListeners(r.spell.id, r.spell.name, now);
        }
        return;
      case 'free':
        this.reachListeners('free', 'Free', now);
        return;
      case 'curiosity': {
        foundCuriosity(r.index);
        this.showCaption(`${CURIOSITIES[r.index]} · curiosity ${progress.curiosities.length}/${CURIOSITIES.length}`, HANDWRITING, now);
        if (r.index === 0) this.flickerUntil = now + 1500;
        else if (r.index === 1) this.humUntil = now + 1200;
        else this.mothsUntil = now + 4000;
        return;
      }
      case 'empty':
        return;
    }
  }

  /** Sleep, Cuckoo and Free reach only the listeners who can hear (build spec §5). */
  private reachListeners(spell: SpellId | 'free', name: string, now: number): void {
    const { heard, missed } = hearing.cast(spell);
    synth.chime();
    if (heard.length === 0) {
      this.showCaption(missed.length ? `${name}: no one heard it.` : `${name}: no one here to hear it.`, HANDWRITING, now);
    } else {
      this.showCaption(name, GOLD, now);
    }
  }

  /** Returns true if the object is now lifted. */
  private toggleLift(object: Object3D): boolean {
    let s = this.lifts.get(object);
    if (!s) {
      const height = typeof object.userData.liftHeight === 'number' ? object.userData.liftHeight : 0.3;
      s = { baseY: object.position.y, height, lifted: false, t: 0 };
      this.lifts.set(object, s);
    }
    s.lifted = !s.lifted;
    return s.lifted;
  }

  /** Placed where the player is actually looking (often down at the staff), just above it. */
  private showCaption(text: string, color: string, now: number, ms = CAPTION_MS): void {
    getViewer(this.world, this.eye, this.forward);
    const m = this.caption.mesh;
    m.position.copy(this.eye).addScaledVector(this.forward, 0.75);
    m.position.y += 0.16;
    m.lookAt(this.eye);
    this.caption.set(text, color);
    this.captionUntil = now + ms;
  }
}
