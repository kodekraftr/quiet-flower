/**
 * The floating staff (build spec §2 and §4):
 * clap (or one-hand pinch-hold) to summon · pinch a note from the palette and
 * drop it on the staff · pinch a placed note off to remove it · hold a fist
 * to cast · poke the knot (or clap) to dismiss.
 *
 * Notes keep their own pitch: a dropped note snaps to ITS line at the next
 * free beat, so the drop only has to land somewhere on the staff.
 */

import { createSystem } from '@iwsdk/core';
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { synth } from '../audio/synth.js';
import { settings } from '../config.js';
import { LINE_COLOR_CSS, LINE_COLORS, LINE_COUNT, noteName } from '../game/notes.js';
import { MAX_BEATS, matchMelody, rhythmFor, unlockedLines } from '../game/spells.js';
import type { Point3 } from '../input/gestures.js';
import { frameGestures, HANDEDNESS, hands, type Handedness } from '../input/hand-state.js';
import { CanvasText } from '../scene/canvas-text.js';
import { getViewer } from '../scene/viewer.js';
import { effects } from './effects.js';
import { game, progress, sceneRules } from './progress-state.js';
import { staffApi, staffState } from './staff-state.js';
import { targeting } from './targeting.js';

// Layout in the staff's own space, metres: x right, y up, +z toward the player.
const LINE_Y = [-0.0525, -0.0175, 0.0175, 0.0525] as const;
const LINE_HALF = 0.18;
const BEAT_X0 = -0.125;
const BEAT_DX = 0.05;
const PALETTE_Y = -0.105;
const PALETTE_X0 = -0.0825;
const PALETTE_DX = 0.055;
const KNOT_X = 0.215;
const NOTE_R = 0.012;
const TOKEN_R = 0.014;
const PICK_RADIUS = 0.05;
const NOTE_PICK_RADIUS = 0.035;
const DROP_DEPTH = 0.08;
const DROP_HALF_HEIGHT = 0.085;
const POKE_RADIUS = 0.025;
/** While held, fingers parting past this (but not yet released) freeze the note in place. */
const HOLD_STILL_DISTANCE = 0.022;
const RING_DOTS = 24;
const RING_RADIUS = 0.07;
const OPEN_SECONDS = 0.35;
const CHEST_DROP = 0.22;

function shapeGeometry(line: number, r: number): BufferGeometry {
  switch (line) {
    case 0:
      return new CircleGeometry(r, 28); // circle
    case 1: {
      const g = new CircleGeometry(r * 1.2, 3); // triangle, point up
      g.rotateZ(Math.PI / 2);
      return g;
    }
    case 2:
      return new PlaneGeometry(r * 1.7, r * 1.7); // square
    default: {
      const g = new PlaneGeometry(r * 1.45, r * 1.45); // diamond
      g.rotateZ(Math.PI / 4);
      return g;
    }
  }
}

interface Token {
  line: number;
  unlocked: boolean;
  mesh: Mesh;
  outline: Mesh<RingGeometry, MeshBasicMaterial>;
  label: CanvasText;
  local: Vector3;
}

interface Held {
  line: number;
  hand: Handedness;
}

export class StaffSystem extends createSystem({}) {
  private readonly root = new Group();
  private readonly body = new Group();
  private readonly noteGeos: BufferGeometry[] = [];
  private readonly tokenGeos: BufferGeometry[] = [];
  private readonly noteMats: MeshBasicMaterial[] = [];
  private readonly haloMats: MeshBasicMaterial[] = [];
  private readonly ghostMats: MeshBasicMaterial[] = [];
  private readonly placed: Mesh[] = [];
  private readonly halos: Mesh[] = [];
  private readonly tokens: Token[] = [];
  private readonly heldMesh = new Mesh();
  private readonly ghostMesh = new Mesh();
  private readonly knot = new Mesh();
  private readonly ring = new Group();
  private readonly ringDots: Mesh[] = [];
  private readonly unlocked = new Set(unlockedLines(progress.learned));
  private readonly lockedMat = new MeshBasicMaterial({ color: 0x3a4452, side: DoubleSide });
  private held: Held | null = null;
  private openTime = 0;
  private playingUntil = 0;
  private clearAt = 0;
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly heldLocal = new Vector3();
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();

  init(): void {
    this.build();
    this.root.visible = false;
    this.ring.visible = false;
    this.scene.add(this.root);
    this.scene.add(this.ring);

    staffApi.open = () => this.open();
    staffApi.close = () => this.close();
    staffApi.toggle = () => (staffState.open ? this.close() : this.open());
    staffApi.appendLine = (line) => this.appendLine(line);
    staffApi.removeLast = () => {
      if (!staffState.open || staffState.melody.length === 0) return;
      staffState.melody.pop();
      this.layout();
      synth.tick();
    };
    staffApi.cast = () => this.cast();
    this.cleanupFuncs.push(game.on('learned', () => this.refreshTokens()));
    this.cleanupFuncs.push(() => {
      this.root.removeFromParent();
      this.ring.removeFromParent();
    });
  }

  update(delta: number): void {
    const now = performance.now();
    if (frameGestures.clapped) {
      if (staffState.open) this.close();
      else this.open();
    } else if (!staffState.open && (hands.left.holdSummon || hands.right.holdSummon)) {
      this.open();
    }

    if (this.clearAt && now >= this.clearAt) {
      this.clearAt = 0;
      staffState.melody.length = 0;
      this.layout();
    }

    if (staffState.open) {
      this.openTime += delta;
      const k = Math.min(1, this.openTime / OPEN_SECONDS);
      this.body.scale.set(Math.max(0.001, 1 - (1 - k) ** 3), 1, 1);
      if (now >= this.playingUntil) this.handleHands();
      if (hands.left.castCompleted || hands.right.castCompleted) this.cast();
    }
    this.updateRing();
    staffState.timeScale = staffState.open ? 0.3 : 1;
  }

  // ── Summon / dismiss ────────────────────────────────────────────────

  private open(): void {
    if (staffState.open || !progress.staffUnlocked) return;
    this.refreshTokens();
    getViewer(this.world, this.eye, this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.root.position.copy(this.eye).addScaledVector(this.forward, settings.staffDistance);
    this.root.position.y = this.eye.y - CHEST_DROP;
    this.v1.set(this.eye.x, this.root.position.y, this.eye.z);
    this.root.lookAt(this.v1); // +Z (the staff's face) toward the player
    this.root.visible = true;
    this.openTime = 0;
    this.body.scale.set(0.001, 1, 1);
    staffState.open = true;
    synth.whoosh(true);
    game.emit('staff', { open: true });
  }

  private close(): void {
    if (!staffState.open) return;
    if (this.held) this.dropHeld(null);
    this.root.visible = false;
    staffState.open = false;
    synth.whoosh(false);
    game.emit('staff', { open: false });
  }

  // ── Hands ───────────────────────────────────────────────────────────

  private handleHands(): void {
    for (const key of HANDEDNESS) {
      const h = hands[key];
      if (!h.sample.tracked) {
        if (this.held?.hand === key) this.dropHeld(null);
        continue;
      }
      if (!h.pinching && !this.held && this.nearKnot(h.indexTip)) {
        this.close();
        return;
      }
      if (h.pinchStarted && !this.held) this.pick(key, h.pinchPoint);
      if (this.held?.hand === key) {
        // Opening the fingers moves the pinch point; drop where the note was last
        // held firmly, not where the parting fingers ended up.
        if (h.pinchEnded) {
          this.dropHeld(this.heldLocal);
        } else if (h.pinchDistance <= HOLD_STILL_DISTANCE) {
          this.toLocal(h.pinchPoint, this.heldLocal);
          this.heldMesh.position.set(this.heldLocal.x, this.heldLocal.y, this.heldLocal.z + 0.004);
          this.updateGhost(this.heldLocal);
        }
      }
    }
    this.updateHover();
  }

  private pick(hand: Handedness, point: Point3): void {
    this.toLocal(point, this.v1);
    let token: Token | null = null;
    let best = PICK_RADIUS;
    for (const t of this.tokens) {
      if (!t.unlocked) continue;
      const d = this.v1.distanceTo(t.local);
      if (d < best) {
        best = d;
        token = t;
      }
    }
    if (token) {
      this.hold(token.line, hand);
      return;
    }
    let index = -1;
    best = NOTE_PICK_RADIUS;
    for (let i = 0; i < staffState.melody.length; i++) {
      this.v2.set(BEAT_X0 + i * BEAT_DX, LINE_Y[staffState.melody[i]], 0);
      const d = this.v1.distanceTo(this.v2);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    if (index >= 0) {
      const [line] = staffState.melody.splice(index, 1);
      this.layout();
      this.hold(line, hand);
    }
  }

  private hold(line: number, hand: Handedness): void {
    this.held = { line, hand };
    this.toLocal(hands[hand].pinchPoint, this.heldLocal);
    this.heldMesh.geometry = this.noteGeos[line];
    this.heldMesh.material = this.noteMats[line];
    this.heldMesh.visible = true;
    this.ghostMesh.geometry = this.noteGeos[line];
    this.ghostMesh.material = this.ghostMats[line];
    synth.tick();
  }

  /** `local` = drop point in staff space, or null to discard (tracking lost, staff closed). */
  private dropHeld(local: Vector3 | null): void {
    const held = this.held;
    if (!held) return;
    this.held = null;
    this.heldMesh.visible = false;
    this.ghostMesh.visible = false;
    if (local && this.inDropZone(local) && staffState.melody.length < MAX_BEATS) {
      staffState.melody.push(held.line);
      this.layout();
      synth.note(held.line, settings.notation, 0, 0.45);
    } else {
      synth.thud();
    }
  }

  private appendLine(line: number): void {
    if (!staffState.open || line < 0 || line >= LINE_COUNT) return;
    if (!this.unlocked.has(line) || staffState.melody.length >= MAX_BEATS) {
      synth.thud();
      return;
    }
    staffState.melody.push(line);
    this.layout();
    synth.note(line, settings.notation, 0, 0.45);
  }

  private inDropZone(p: Vector3): boolean {
    return Math.abs(p.z) < DROP_DEPTH && Math.abs(p.x) < LINE_HALF + 0.03 && Math.abs(p.y) < DROP_HALF_HEIGHT;
  }

  private updateGhost(local: Vector3): void {
    const show = !!this.held && this.inDropZone(local) && staffState.melody.length < MAX_BEATS;
    this.ghostMesh.visible = show;
    if (show && this.held) {
      this.ghostMesh.position.set(BEAT_X0 + staffState.melody.length * BEAT_DX, LINE_Y[this.held.line], 0.002);
    }
  }

  private updateHover(): void {
    for (const t of this.tokens) {
      let near = false;
      if (t.unlocked && !this.held) {
        for (const key of HANDEDNESS) {
          const h = hands[key];
          if (!h.sample.tracked) continue;
          this.toLocal(h.pinchPoint, this.v2);
          if (this.v2.distanceTo(t.local) < PICK_RADIUS) near = true;
        }
      }
      t.mesh.scale.setScalar(near ? 1.3 : 1);
    }
  }

  private nearKnot(tip: Point3): boolean {
    this.knot.getWorldPosition(this.v2);
    return Math.hypot(tip.x - this.v2.x, tip.y - this.v2.y, tip.z - this.v2.z) < POKE_RADIUS;
  }

  private toLocal(p: Point3, out: Vector3): Vector3 {
    out.set(p.x, p.y, p.z);
    return this.root.worldToLocal(out);
  }

  // ── Cast ────────────────────────────────────────────────────────────

  private cast(): void {
    const now = performance.now();
    if (!staffState.open || this.held || now < this.playingUntil) return;
    const melody = [...staffState.melody];
    const result = matchMelody(melody, progress.learned, sceneRules.allowFree);
    if (result.kind === 'empty') return;
    const seconds = synth.playMelody(melody, rhythmFor(result, melody.length), settings.notation);
    effects.cast(result, targeting.current, seconds);
    this.playingUntil = now + seconds * 1000;
    // A spell clears the staff once it has played; a Curiosity leaves the notes to edit.
    if (result.kind === 'spell' || result.kind === 'free') this.clearAt = this.playingUntil + 150;
  }

  private updateRing(): void {
    let hand: Handedness | null = null;
    let progress = 0;
    if (staffState.open && staffState.melody.length > 0 && !this.held) {
      for (const key of HANDEDNESS) {
        if (hands[key].fistProgress > progress) {
          progress = hands[key].fistProgress;
          hand = key;
        }
      }
    }
    if (!hand) {
      this.ring.visible = false;
      return;
    }
    const palm = hands[hand].palm;
    this.ring.position.set(palm.x, palm.y, palm.z);
    getViewer(this.world, this.eye, this.forward);
    this.ring.lookAt(this.eye);
    const lit = Math.round(progress * RING_DOTS);
    this.ringDots.forEach((dot, i) => (dot.visible = i < lit));
    this.ring.visible = true;
  }

  // ── Visuals ─────────────────────────────────────────────────────────

  /** Notes unlock as spells are found (one new note per scene). */
  private refreshTokens(): void {
    this.unlocked.clear();
    for (const line of unlockedLines(progress.learned)) this.unlocked.add(line);
    for (const t of this.tokens) {
      t.unlocked = this.unlocked.has(t.line);
      t.mesh.material = t.unlocked ? this.noteMats[t.line] : this.lockedMat;
      t.outline.material.color.setHex(t.unlocked ? LINE_COLORS[t.line] : 0x3a4452);
      t.label.set(t.unlocked ? noteName(t.line, settings.notation) : 'locked', t.unlocked ? '#E8EEF5' : '#6F7C8C');
    }
  }

  private layout(): void {
    for (let i = 0; i < MAX_BEATS; i++) {
      const note = this.placed[i];
      const halo = this.halos[i];
      const line = staffState.melody[i];
      const show = line !== undefined;
      note.visible = show;
      halo.visible = show;
      if (!show) continue;
      note.geometry = this.noteGeos[line];
      note.material = this.noteMats[line];
      halo.geometry = this.noteGeos[line];
      halo.material = this.haloMats[line];
      note.position.set(BEAT_X0 + i * BEAT_DX, LINE_Y[line], 0.003);
      halo.position.set(BEAT_X0 + i * BEAT_DX, LINE_Y[line], 0.001);
    }
  }

  private build(): void {
    this.root.name = 'staff';
    this.root.add(this.body);

    for (let line = 0; line < LINE_COUNT; line++) {
      this.noteGeos.push(shapeGeometry(line, NOTE_R));
      this.tokenGeos.push(shapeGeometry(line, TOKEN_R));
      this.noteMats.push(new MeshBasicMaterial({ color: LINE_COLORS[line], side: DoubleSide }));
      this.haloMats.push(new MeshBasicMaterial({ color: LINE_COLORS[line], transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide }));
      this.ghostMats.push(new MeshBasicMaterial({ color: LINE_COLORS[line], transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide }));
    }

    const panel = new Mesh(
      new PlaneGeometry(0.5, 0.27),
      new MeshBasicMaterial({ color: 0x0a0e14, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    panel.position.set(0, -0.03, -0.003);
    this.body.add(panel);

    const tickGeo = new PlaneGeometry(0.0012, 0.135);
    const tickMat = new MeshBasicMaterial({ color: 0xe8eef5, transparent: true, opacity: 0.15, depthWrite: false });
    for (let b = 0; b < MAX_BEATS; b++) {
      const tick = new Mesh(tickGeo, tickMat);
      tick.position.set(BEAT_X0 + b * BEAT_DX, 0, -0.001);
      this.body.add(tick);
    }

    const lineGeo = new BoxGeometry(LINE_HALF * 2, 0.0028, 0.0008);
    for (let line = 0; line < LINE_COUNT; line++) {
      const bar = new Mesh(lineGeo, new MeshBasicMaterial({ color: LINE_COLORS[line] }));
      bar.position.set(0, LINE_Y[line], 0);
      this.body.add(bar);
      const label = new CanvasText(0.04, 0.016, 256, 100);
      label.set(noteName(line, settings.notation), LINE_COLOR_CSS[line]);
      label.mesh.position.set(-0.207, LINE_Y[line], 0.001);
      this.body.add(label.mesh);
    }

    // Palette under the staff: one token per line; locked lines are grey.
    const backingGeo = new CircleGeometry(0.022, 32);
    const backingMat = new MeshBasicMaterial({ color: 0x0b1016, transparent: true, opacity: 0.9, depthWrite: false });
    for (let line = 0; line < LINE_COUNT; line++) {
      const local = new Vector3(PALETTE_X0 + line * PALETTE_DX, PALETTE_Y, 0.002);
      const backing = new Mesh(backingGeo, backingMat);
      backing.position.set(local.x, local.y, 0);
      this.body.add(backing);
      const outline = new Mesh(new RingGeometry(0.021, 0.0235, 40), new MeshBasicMaterial({ color: 0x3a4452, side: DoubleSide }));
      outline.position.set(local.x, local.y, 0.001);
      this.body.add(outline);
      const mesh = new Mesh(this.tokenGeos[line], this.lockedMat);
      mesh.position.copy(local);
      this.body.add(mesh);
      const label = new CanvasText(0.05, 0.016, 256, 82);
      label.mesh.position.set(local.x, local.y - 0.031, 0.001);
      this.body.add(label.mesh);
      this.tokens.push({ line, unlocked: false, mesh, outline, label, local });
    }
    this.refreshTokens();

    // Dismiss knot at the right end.
    this.knot.geometry = new SphereGeometry(0.011, 16, 12);
    this.knot.material = new MeshBasicMaterial({ color: 0xa9b6c6 });
    this.knot.position.set(KNOT_X, 0, 0.004);
    this.body.add(this.knot);

    for (let i = 0; i < MAX_BEATS; i++) {
      const halo = new Mesh(this.noteGeos[0], this.haloMats[0]);
      halo.scale.setScalar(1.8);
      halo.visible = false;
      this.body.add(halo);
      this.halos.push(halo);
      const note = new Mesh(this.noteGeos[0], this.noteMats[0]);
      note.visible = false;
      this.body.add(note);
      this.placed.push(note);
    }

    this.heldMesh.visible = false;
    this.root.add(this.heldMesh);
    this.ghostMesh.visible = false;
    this.root.add(this.ghostMesh);

    // Cast ring: dots that light up around the fist as it is held.
    const dotGeo = new SphereGeometry(0.0045, 8, 6);
    const dotMat = new MeshBasicMaterial({ color: 0xf7d27a });
    for (let i = 0; i < RING_DOTS; i++) {
      const a = Math.PI / 2 - (i / RING_DOTS) * Math.PI * 2;
      const dot = new Mesh(dotGeo, dotMat);
      dot.position.set(Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS, 0);
      this.ring.add(dot);
      this.ringDots.push(dot);
    }
  }
}
