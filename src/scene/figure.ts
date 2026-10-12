/**
 * A character from art/build_figure.py, posed in code. Each character is one
 * skinned mesh with one vertex-coloured material (one draw call), lit by the
 * scene's few real-time lights (the rooms themselves are baked and unlit).
 *
 * Poses are blended every frame from a handful of parameters (sit, doze,
 * point, walk, …) into bone rotations given in the figure's own space
 * (x = its left, y = up, z = the way it faces), so a rotation reads the same on
 * every bone whatever its rest orientation. No allocation per frame.
 */

import {
  Euler,
  type Material,
  MeshLambertMaterial,
  type Object3D,
  Quaternion,
  SkinnedMesh,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type FigureName = 'tolo' | 'senn' | 'mara' | 'dov' | 'brakk' | 'prisoner_a' | 'prisoner_b' | 'prisoner_c';

const BONE_NAMES = [
  'hips', 'spine', 'head',
  'upper_armL', 'lower_armL', 'handL', 'upper_armR', 'lower_armR', 'handR',
  'thighL', 'shinL', 'thighR', 'shinR',
] as const;
type BoneName = (typeof BONE_NAMES)[number];

/** Hips sit this much lower when seated on a stool. */
const SEAT_DROP = 0.42;
const WALK_SPEED = 0.9; // m/s
const TURN_RATE = 4; // rad/s

let sharedMaterial: MeshLambertMaterial | null = null;

interface BoneRig {
  bone: Object3D;
  restLocal: Quaternion;
  /** Rest orientation relative to the figure root, and its inverse. */
  w: Quaternion;
  wInv: Quaternion;
  /** Figure-space rotation for this frame (x, y, z radians). */
  rx: number;
  ry: number;
  rz: number;
}

export class Figure {
  readonly root: Object3D;
  readonly name: FigureName;
  // Pose parameters (0–1 unless noted); set by the scene, blended each frame.
  sit = 0;
  doze = 0;
  /** Slow drowsy nodding while awake (Tolo). */
  nodding = false;
  /** Rolling dice with the right hand (Senn). */
  dice = false;
  /** Forearms resting on a table. */
  armsOnTable = 0;
  /** Right arm raised toward the player. */
  point = 0;
  /** Hands to the ears / looking around (lured, puzzled). */
  puzzled = 0;

  private readonly rig = new Map<BoneName, BoneRig>();
  private readonly baseY: number;
  private walkPhase = 0;
  private path: Vector3[] = [];
  private pathIndex = 0;
  private faceYaw: number | null = null;
  private readonly smooth = { sit: 0, doze: 0, armsOnTable: 0, point: 0, puzzled: 0, walk: 0 };
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'XYZ');
  private readonly tmp = new Vector3();

  constructor(gltf: GLTF, name: FigureName, position: Vector3, facing: Vector3) {
    const source = gltf.scene.getObjectByName(`fig_${name}`);
    if (!source) throw new Error(`figures.glb is missing fig_${name}`);
    this.name = name;
    this.root = cloneSkinned(source);
    this.root.position.copy(position);
    this.baseY = position.y;
    this.face(facing, true);

    sharedMaterial ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.root.traverse((o) => {
      if (o instanceof SkinnedMesh) {
        const old = o.material as Material;
        if (!o.geometry.getAttribute('color')) o.material = new MeshLambertMaterial({ color: 0x8a8070, flatShading: true });
        else o.material = sharedMaterial!;
        old.dispose();
        o.frustumCulled = false;
      }
    });
    this.root.updateMatrixWorld(true);

    // Bones are renamed per copy in the GLB (hips, hips_1, …): match by base name.
    const rootInv = new Quaternion();
    this.root.getWorldQuaternion(rootInv).invert();
    this.root.traverse((o) => {
      const base = o.name.replace(/_\d+$/, '') as BoneName;
      if (!(BONE_NAMES as readonly string[]).includes(base) || this.rig.has(base) || (o as { isBone?: boolean }).isBone !== true) return;
      const w = new Quaternion();
      o.getWorldQuaternion(w).premultiply(rootInv);
      this.rig.set(base, { bone: o, restLocal: o.quaternion.clone(), w, wInv: w.clone().invert(), rx: 0, ry: 0, rz: 0 });
    });
  }

  /** Find a prop that belongs to this character (e.g. Brakk's earmuffs). */
  prop(name: string): Object3D | undefined {
    let found: Object3D | undefined;
    this.root.traverse((o) => {
      if (!found && o.name.replace(/_\d+$/, '') === name) found = o;
    });
    return found;
  }

  /** Turn to face a world point (on the floor plane). */
  face(target: Vector3, instant = false): void {
    this.faceYaw = Math.atan2(target.x - this.root.position.x, target.z - this.root.position.z);
    if (instant) this.root.rotation.y = this.faceYaw;
  }

  /** Walk along world points (stands up first). */
  walkTo(points: readonly Vector3[]): void {
    this.path = points.map((p) => p.clone());
    this.pathIndex = 0;
    this.sit = 0;
  }

  get walking(): boolean {
    return this.pathIndex < this.path.length;
  }

  /** Back to a pose and place instantly (rewind). */
  snap(position: Vector3, facing: Vector3): void {
    this.path = [];
    this.pathIndex = 0;
    this.root.position.copy(position);
    this.face(facing, true);
    for (const k of Object.keys(this.smooth) as (keyof typeof this.smooth)[]) {
      this.smooth[k] = k === 'walk' ? 0 : (this[k as Exclude<typeof k, 'walk'>] as number);
    }
  }

  update(dt: number, time: number): void {
    const s = this.smooth;
    const k = Math.min(1, dt * 4);
    s.sit += (this.sit - s.sit) * k;
    s.doze += (this.doze - s.doze) * Math.min(1, dt * 2);
    s.armsOnTable += (this.armsOnTable - s.armsOnTable) * k;
    s.point += (this.point - s.point) * k;
    s.puzzled += (this.puzzled - s.puzzled) * k;

    // Walking along the path.
    let moving = false;
    if (this.walking && s.sit < 0.15) {
      const target = this.path[this.pathIndex];
      this.tmp.subVectors(target, this.root.position).setY(0);
      const d = this.tmp.length();
      if (d < 0.05) {
        this.pathIndex++;
      } else {
        moving = true;
        this.faceYaw = Math.atan2(this.tmp.x, this.tmp.z);
        this.root.position.addScaledVector(this.tmp.normalize(), Math.min(d, WALK_SPEED * dt));
      }
    }
    s.walk += ((moving ? 1 : 0) - s.walk) * k;
    if (moving) this.walkPhase += dt * 6.5;
    if (this.faceYaw !== null) {
      let diff = this.faceYaw - this.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.root.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * dt);
    }

    // Figure-space bone rotations.
    for (const r of this.rig.values()) r.rx = r.ry = r.rz = 0;
    const sw = Math.sin(this.walkPhase) * s.walk;
    const breathe = Math.sin(time * 1.6) * 0.02 * (1 - s.doze * 0.5);
    this.add('spine', breathe + 0.18 * s.doze + 0.05 * s.armsOnTable, 0, 0);
    let headX = 0.55 * s.doze;
    if (this.nodding && s.doze < 0.5) headX += 0.22 + 0.16 * Math.max(0, Math.sin(time * 0.55)) ** 3;
    this.add('head', headX, Math.sin(time * 0.4) * 0.15 * s.puzzled, 0);
    this.add('hips', 0, 0, 0);

    for (const side of ['L', 'R'] as const) {
      const sign = side === 'L' ? 1 : -1;
      const legSwing = sign * sw * 0.45;
      this.add(`thigh${side}`, -1.57 * s.sit + legSwing, 0, 0);
      this.add(`shin${side}`, 1.57 * s.sit + Math.max(0, -legSwing) * 0.9, 0, 0);
      const armSwing = -sign * sw * 0.35;
      this.add(`upper_arm${side}`, -0.55 * s.armsOnTable + armSwing, 0, sign * 0.12 * s.doze);
      this.add(`lower_arm${side}`, -0.95 * s.armsOnTable - 0.15 * s.walk, 0, 0);
    }
    if (this.dice && s.doze < 0.3) {
      const burst = Math.max(0, Math.sin(time * 0.9)) ** 4;
      this.add('lower_armR', Math.sin(time * 14) * 0.18 * burst - 0.15 * burst, 0, 0);
    }
    this.add('upper_armR', -1.4 * s.point, 0, -0.15 * s.point);
    this.add('lower_armR', 0.9 * s.armsOnTable * s.point, 0, 0);
    this.add('upper_armL', -0.9 * s.puzzled, 0, 0.6 * s.puzzled);
    this.add('lower_armL', -1.2 * s.puzzled, 0, 0);

    for (const r of this.rig.values()) {
      this.e.set(r.rx, r.ry, r.rz);
      this.q.setFromEuler(this.e);
      // local = restLocal · (W⁻¹ · R · W): R about the bone's pivot in figure axes.
      r.bone.quaternion.copy(r.restLocal).multiply(this.q.premultiply(r.wInv).multiply(r.w));
    }
    this.root.position.y = this.baseY - SEAT_DROP * s.sit + Math.abs(Math.sin(this.walkPhase)) * 0.02 * s.walk;
  }

  private add(name: BoneName, x: number, y: number, z: number): void {
    const r = this.rig.get(name);
    if (!r) return;
    r.rx += x;
    r.ry += y;
    r.rz += z;
  }
}
