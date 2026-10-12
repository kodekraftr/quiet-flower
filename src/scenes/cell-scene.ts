/**
 * Scene 2 — The Cell (storyboard). In order:
 *   1. Look at the bag in the corner and pinch: it opens, and 5 torn pieces of
 *      the player's own song flutter out and hang in the air within reach.
 *   2. Pinch each piece and drop it inside the outline; it snaps home.
 *   3. The page glows and hums, the pebble trembles, and a drawing of a clap
 *      appears in the margin. Rise (Ga Ma) is learned; the staff can be summoned.
 *   4. Clap → the staff; a drawing of a fist appears. Write Ga Ma, hold a fist.
 *   5. Look at the door bar and cast Rise: the bar lifts, the door swings open,
 *      and the scene blinks to the Corridor.
 */

import type { Entity, World } from '@iwsdk/core';
import {
  AdditiveBlending,
  CanvasTexture,
  type Mesh,
  Quaternion,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  CapsuleGeometry,
  Mesh as ThreeMesh,
  MeshBasicMaterial,
} from 'three';
import { synth } from '../audio/synth.js';
import { settings } from '../config.js';
import { PIECE_COUNT, ScrapBoard } from '../game/scraps.js';
import { Liftable, Listener, SoundBlocker } from '../game-components.js';
import { HANDEDNESS, hands, type Handedness } from '../input/hand-state.js';
import { buildCell, type Cell } from '../scene/cell.js';
import { SongSheet } from '../scene/song-sheet.js';
import { getViewer } from '../scene/viewer.js';
import { effects } from '../systems/effects.js';
import { hints } from '../systems/hints.js';
import { game, learn, progress } from '../systems/progress-state.js';
import { sceneFlow } from '../systems/scene-flow.js';
import type { StoryScene } from './scene.js';

type Stage = 'bag' | 'pieces' | 'song' | 'clap' | 'compose' | 'door' | 'leaving';

const BAG_LOOK_ANGLE = (16 * Math.PI) / 180;
const LOOK_DWELL_MS = 150;
const GRAB_RADIUS = 0.075;
const HOLD_STILL_DISTANCE = 0.022;
const FLIGHT_S = 0.9;
const FLIGHT_STAGGER_S = 0.16;
const SNAP_S = 0.25;
const RETURN_S = 0.45;
const SONG_S = 3.2;
const ASIDE_S = 1.4;
const DOOR_DELAY_MS = 1100;
const DOOR_S = 1.9;
const DOOR_OPEN_ANGLE = -1.35;
const LEAVE_AFTER_MS = 2600;
/** Beyond this distance from the eyes, a dropped piece floats back to its spot. */
const MAX_REACH = 0.8;

/** Where each torn piece hangs before it is placed, in page space (metres), and its tilt. */
const REST: readonly [number, number, number, number][] = [
  [-0.27, 0.11, 0.05, 0.5],
  [0.27, 0.12, 0.06, -0.42],
  [-0.29, -0.1, 0.05, -0.6],
  [0.0, -0.21, 0.07, 0.32],
  [0.29, -0.1, 0.05, 0.55],
];

/** The garden song the page hums when it is whole: the Rise notes, then the rest. */
const PAGE_MELODY = [2, 3, 2, 1, 0, 2, 3];

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(247,210,122,0.85)');
  grad.addColorStop(0.5, 'rgba(247,210,122,0.25)');
  grad.addColorStop(1, 'rgba(247,210,122,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface PieceAnim {
  from: Vector3;
  fromRot: number;
  to: Vector3;
  toRot: number;
  t: number;
  duration: number;
  arc: number;
}

export class CellScene implements StoryScene {
  readonly id = 'cell' as const;
  readonly title = 'The Cell';
  readonly allowFree = false;

  private world!: World;
  private cell!: Cell;
  private sheet!: SongSheet;
  private readonly entities: Entity[] = [];
  private readonly offs: (() => void)[] = [];
  private readonly board = new ScrapBoard();
  private stage: Stage = 'bag';
  private stageStart = 0;
  private doorEntity: Entity | null = null;

  private bagGlow!: Sprite;
  private bagLookSince = -1;

  private readonly anims: (PieceAnim | null)[] = new Array(PIECE_COUNT).fill(null);
  private held: { piece: number; hand: Handedness; offset: Vector3 } | null = null;
  private readonly asideFrom = new Vector3();
  private readonly asideTo = new Vector3();
  private readonly asideFromQ = new Quaternion();
  private readonly asideToQ = new Quaternion();
  private doorOpenAt = 0;
  private doorDone = 0;

  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();

  async load(world: World): Promise<void> {
    this.world = world;
    const gltf = await world.assetManager.loadGLTFById('cell');
    this.cell = buildCell({ ...gltf, scene: gltf.scene.clone(true) });
    const c = this.cell;
    this.entities.push(world.createTransformEntity(c.room, { persistent: true }));
    const liftables = [
      { object: c.pebble, radius: 0.2, liftHeight: 0.3 },
      { object: c.crate, radius: 0.3, liftHeight: 0.25 },
      { object: c.doorBar, radius: 0.35, liftHeight: 0.32 },
    ];
    for (const { object, radius, liftHeight } of liftables) {
      object.userData.liftHeight = liftHeight;
      this.entities.push(world.createTransformEntity(object, { persistent: true }).addComponent(Liftable, { radius, liftHeight }));
    }
    this.doorEntity = world.createTransformEntity(c.door, { persistent: true }).addComponent(SoundBlocker, { closed: true });
    this.entities.push(this.doorEntity);
    effects.register({ lantern: c.lanternCenter, pebble: c.pebble, dust: c.dust });

    if (settings.debug) {
      // A stand-in listener out in the corridor: behind the closed door it shows the
      // struck ear with a door glyph; once the door opens it can hear.
      const body = new ThreeMesh(new CapsuleGeometry(0.18, 1.1, 4, 10), new MeshBasicMaterial({ color: 0x2a3340 }));
      body.position.set(2.9, 0.75, -0.7);
      this.entities.push(world.createTransformEntity(body, { persistent: true }).addComponent(Listener, { name: 'Test listener', markerHeight: 1.25 }));
    }

    this.sheet = new SongSheet(settings.notation);
    this.sheet.group.visible = false;
    this.entities.push(world.createTransformEntity(this.sheet.group, { persistent: true }));

    this.bagGlow = new Sprite(new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, transparent: true, depthWrite: false }));
    this.bagGlow.position.copy(c.bagCenter);
    this.bagGlow.scale.setScalar(0.7);
    this.bagGlow.visible = false;
    this.entities.push(world.createTransformEntity(this.bagGlow, { persistent: true }));

    this.offs.push(
      game.on('staff', ({ open }) => {
        if (open && this.stage === 'clap') this.setStage('compose');
      }),
      game.on('rise', ({ target, lifted }) => {
        if (this.stage === 'compose') {
          effects.say('Spell learned: Rise', '#F7D27A', 3200);
          this.setStage('door');
        }
        if (target === c.doorBar && lifted && !this.doorOpenAt) {
          this.doorOpenAt = performance.now() + DOOR_DELAY_MS;
          game.emit('progress', 'door bar lifted');
        }
      }),
    );

    this.stage = progress.learned.includes('rise') && progress.staffUnlocked && settings.learnAll ? 'door' : 'bag';
    if (this.stage === 'door') this.showPageAside(true);
  }

  begin(): void {
    this.setStage(this.stage);
    if (this.stage === 'bag') effects.say('My bag… they left my bag in the corner.', undefined, 3800);
  }

  unload(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    hints.page = null;
    hints.set(null);
    effects.clear();
    for (const e of this.entities) e.dispose();
    this.entities.length = 0;
  }

  interact(): void {
    if (this.stage === 'bag') this.openBag();
    else if (this.stage === 'pieces') {
      const id = this.board.nextLoose();
      if (id >= 0 && !this.anims[id]) this.placePiece(id);
    }
  }

  update(delta: number): void {
    const now = performance.now();
    switch (this.stage) {
      case 'bag':
        this.updateBag(now);
        break;
      case 'pieces':
        this.updatePieces(delta);
        break;
      case 'song':
        this.updateSong(now, delta);
        break;
      default:
        break;
    }
    this.updateDoor(now, delta);
  }

  // ── Steps ───────────────────────────────────────────────────────────

  private setStage(stage: Stage): void {
    this.stage = stage;
    this.stageStart = performance.now();
    const n = settings.notation === 'western';
    switch (stage) {
      case 'bag':
        hints.set('My bag is in the corner. Look at it and pinch.');
        break;
      case 'pieces':
        hints.page = null;
        hints.set('Pinch each torn piece and drop it inside the outline.');
        break;
      case 'song':
        hints.set(null);
        break;
      case 'clap':
        hints.page = this.sheet;
        hints.set('Clap your hands, then pull them apart.');
        break;
      case 'compose':
        this.sheet.margins.fist = true;
        this.sheet.redraw();
        hints.set(`Pinch ${n ? 'C' : 'Ga'}, then ${n ? 'D' : 'Ma'}, onto the staff. Then hold a fist.`);
        break;
      case 'door':
        hints.page = this.sheet;
        hints.set('The door bar is stone. Look at it and sing Rise.');
        break;
      default:
        hints.set(null);
    }
  }

  private updateBag(now: number): void {
    getViewer(this.world, this.eye, this.forward);
    this.v1.subVectors(this.cell.bagCenter, this.eye);
    const looking = this.forward.angleTo(this.v1) < BAG_LOOK_ANGLE;
    if (looking && this.bagLookSince < 0) this.bagLookSince = now;
    if (!looking) this.bagLookSince = -1;
    const lit = this.bagLookSince >= 0 && now - this.bagLookSince >= LOOK_DWELL_MS;
    this.bagGlow.visible = lit;
    if (lit) {
      this.bagGlow.material.opacity = 0.6 + 0.3 * Math.sin(now / 220);
      for (const key of HANDEDNESS) if (hands[key].pinchStarted) this.openBag();
    }
  }

  private openBag(): void {
    if (this.stage !== 'bag') return;
    this.bagGlow.visible = false;
    synth.whoosh(true);
    synth.tick();
    game.emit('progress', 'bag opened');

    // The page hangs in front, a little below the eyes, tilted toward them.
    getViewer(this.world, this.eye, this.forward);
    this.flatForward();
    const g = this.sheet.group;
    // Within arm's reach in VR; further off on a flat screen, whose view is narrower.
    const flat = !this.world.session;
    g.position.copy(this.eye).addScaledVector(this.forward, flat ? 0.75 : 0.38);
    g.position.y = this.eye.y - (flat ? 0.22 : 0.3);
    g.lookAt(this.eye);
    g.updateMatrixWorld(true);
    g.visible = true;
    this.sheet.outline.visible = true;

    const from = g.worldToLocal(this.v1.copy(this.cell.bagCenter));
    this.sheet.pieces.forEach((piece, i) => {
      const [x, y, z, rot] = REST[i];
      piece.position.copy(from);
      piece.rotation.z = rot * 4;
      this.anims[i] = { from: from.clone(), fromRot: rot * 4, to: new Vector3(x, y, z), toRot: rot, t: -i * FLIGHT_STAGGER_S, duration: FLIGHT_S, arc: 0.18 };
    });
    this.setStage('pieces');
  }

  private updatePieces(delta: number): void {
    // Flights, snaps and returns.
    for (let i = 0; i < PIECE_COUNT; i++) {
      const a = this.anims[i];
      if (!a) continue;
      a.t += delta;
      const k = Math.min(1, Math.max(0, a.t / a.duration));
      const e = k * k * (3 - 2 * k);
      const p = this.sheet.pieces[i];
      p.position.lerpVectors(a.from, a.to, e);
      p.position.z += Math.sin(k * Math.PI) * a.arc;
      p.rotation.z = a.fromRot + (a.toRot - a.fromRot) * e;
      if (k >= 1) this.anims[i] = null;
    }

    for (const key of HANDEDNESS) {
      const h = hands[key];
      if (this.held?.hand === key) {
        const piece = this.sheet.pieces[this.held.piece];
        if (!h.sample.tracked) {
          this.returnPiece(this.held.piece);
          this.held = null;
          continue;
        }
        // Opening the fingers moves the pinch point, so on the release frame the
        // piece stays where it was held rather than jumping with the fingers.
        if (h.pinchEnded) {
          this.release();
          continue;
        }
        // Fingers already parting (between the pinch's on and off distances): hold still.
        if (h.pinchDistance > HOLD_STILL_DISTANCE) continue;
        this.toPage(h.pinchPoint, this.v1);
        piece.position.copy(this.v1).add(this.held.offset);
        piece.rotation.z -= piece.rotation.z * Math.min(1, delta * 8);
        continue;
      }
      if (!this.held && h.sample.tracked && h.pinchStarted) this.grab(key);
    }
    this.updateHover();

    if (this.board.complete && this.anims.every((a) => a === null)) this.completeSong();
  }

  private grab(hand: Handedness): void {
    this.toPage(hands[hand].pinchPoint, this.v1);
    let best = GRAB_RADIUS;
    let id = -1;
    this.sheet.pieces.forEach((p, i) => {
      if (this.board.placed[i] || this.anims[i]) return;
      const d = p.position.distanceTo(this.v1);
      if (d < best) {
        best = d;
        id = i;
      }
    });
    if (id < 0) return;
    this.held = { piece: id, hand, offset: this.sheet.pieces[id].position.clone().sub(this.v1) };
    this.sheet.pieces[id].scale.setScalar(1.06);
    synth.tick();
  }

  private release(): void {
    if (!this.held) return;
    const id = this.held.piece;
    this.held = null;
    const p = this.sheet.pieces[id];
    p.scale.setScalar(1);
    const home = this.sheet.homes[id];
    if (this.board.drop(id, p.position.x - home.x, p.position.y - home.y, p.position.z - home.z)) {
      this.snapHome(id);
      return;
    }
    p.getWorldPosition(this.v2);
    if (this.v2.distanceTo(this.eye) > MAX_REACH) this.returnPiece(id);
    else synth.thud();
  }

  /** Keyboard fallback: fly the next piece home. */
  private placePiece(id: number): void {
    const home = this.sheet.homes[id];
    this.board.drop(id, 0, 0, 0);
    const p = this.sheet.pieces[id];
    this.anims[id] = { from: p.position.clone(), fromRot: p.rotation.z, to: home.clone(), toRot: 0, t: 0, duration: 0.5, arc: 0.04 };
    synth.note(id % 4, settings.notation, 0.4, 0.3);
    game.emit('progress', 'piece placed');
  }

  private snapHome(id: number): void {
    const p = this.sheet.pieces[id];
    this.anims[id] = { from: p.position.clone(), fromRot: p.rotation.z, to: this.sheet.homes[id].clone(), toRot: 0, t: 0, duration: SNAP_S, arc: 0 };
    synth.tick();
    synth.note(id % 4, settings.notation, 0.05, 0.3);
    game.emit('progress', 'piece placed');
  }

  private returnPiece(id: number): void {
    const p = this.sheet.pieces[id];
    p.scale.setScalar(1);
    const [x, y, z, rot] = REST[id];
    this.anims[id] = { from: p.position.clone(), fromRot: p.rotation.z, to: new Vector3(x, y, z), toRot: rot, t: 0, duration: RETURN_S, arc: 0.03 };
    synth.thud();
  }

  private updateHover(): void {
    this.sheet.pieces.forEach((p: Mesh, i) => {
      if (this.held?.piece === i || this.board.placed[i]) return;
      let near = false;
      for (const key of HANDEDNESS) {
        const h = hands[key];
        if (!h.sample.tracked) continue;
        this.toPage(h.pinchPoint, this.v2);
        if (p.position.distanceTo(this.v2) < GRAB_RADIUS) near = true;
      }
      p.scale.setScalar(near ? 1.05 : 1);
    });
  }

  private completeSong(): void {
    this.setStage('song');
    this.sheet.outline.visible = false;
    synth.playMelody(PAGE_MELODY, [1, 1, 1, 1, 2, 1, 2], settings.notation, 0.42);
    effects.tremble(2800);
    game.emit('progress', 'song restored');
  }

  private updateSong(now: number, delta: number): void {
    const t = (now - this.stageStart) / 1000;
    if (t < SONG_S) {
      this.sheet.margins.glow = 0.55 + 0.45 * Math.sin(t * 5);
      this.sheet.redraw();
      return;
    }
    if (this.sheet.margins.glow > 0) {
      this.sheet.margins.glow = 0;
      this.sheet.margins.clap = true;
      this.sheet.redraw();
      learn('rise');
      this.showPageAside(false);
    }
    const k = Math.min(1, (t - SONG_S) / ASIDE_S);
    const e = k * k * (3 - 2 * k);
    const g = this.sheet.group;
    g.position.lerpVectors(this.asideFrom, this.asideTo, e);
    g.quaternion.slerpQuaternions(this.asideFromQ, this.asideToQ, e);
    g.scale.setScalar(1 - 0.15 * e);
    if (k >= 1) this.setStage('clap');
    void delta;
  }

  /** The finished page moves to the left, where it stays readable but clear of the staff. */
  private showPageAside(instant: boolean): void {
    const g = this.sheet.group;
    getViewer(this.world, this.eye, this.forward);
    this.flatForward();
    this.v1.copy(this.forward).applyAxisAngle(this.v2.set(0, 1, 0), ((this.world.session ? 42 : 30) * Math.PI) / 180);
    this.asideFrom.copy(g.position);
    this.asideFromQ.copy(g.quaternion);
    const flat = !this.world.session;
    this.asideTo.copy(this.eye).addScaledVector(this.v1, flat ? 0.7 : 0.42);
    this.asideTo.y = this.eye.y - (flat ? 0.18 : 0.24);
    g.position.copy(this.asideTo);
    g.lookAt(this.eye);
    this.asideToQ.copy(g.quaternion);
    if (instant) {
      for (let i = 0; i < PIECE_COUNT; i++) {
        this.board.drop(i, 0, 0, 0);
        this.sheet.pieces[i].position.copy(this.sheet.homes[i]);
        this.sheet.pieces[i].rotation.z = 0;
      }
      this.sheet.outline.visible = false;
      this.sheet.margins.clap = true;
      this.sheet.margins.fist = true;
      this.sheet.redraw();
      g.scale.setScalar(0.85);
      g.visible = true;
      hints.page = this.sheet;
      return;
    }
    g.position.copy(this.asideFrom);
    g.quaternion.copy(this.asideFromQ);
  }

  private updateDoor(now: number, delta: number): void {
    if (!this.doorOpenAt || now < this.doorOpenAt) return;
    if (this.doorDone === 0) {
      synth.thud();
      synth.whoosh(false);
      this.doorEntity?.setValue(SoundBlocker, 'closed', false);
      this.cell.corridorGlow.visible = true;
      hints.set(null);
      this.stage = 'leaving';
    }
    this.doorDone = Math.min(1, this.doorDone + delta / DOOR_S);
    const e = 1 - (1 - this.doorDone) ** 3;
    this.cell.door.rotation.y = DOOR_OPEN_ANGLE * e;
    (this.cell.corridorGlow.material as MeshBasicMaterial).opacity = 0.75 * e;
    if (this.doorDone >= 1 && now - this.doorOpenAt > DOOR_S * 1000 + LEAVE_AFTER_MS) {
      this.doorOpenAt = Number.POSITIVE_INFINITY;
      sceneFlow.next();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private flatForward(): void {
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
  }

  private toPage(p: { x: number; y: number; z: number }, out: Vector3): Vector3 {
    out.set(p.x, p.y, p.z);
    return this.sheet.group.worldToLocal(out);
  }
}
