/**
 * Story progress: which scene the player is in, which spells they have found,
 * whether the staff can be summoned yet, and their signature melody.
 * Pure module (no DOM, no Three.js); the live copy is `progress` in
 * src/systems/progress-state.ts.
 */

import { SPELLS, type SpellId } from './spells.js';

/** Scenes in story order (build spec §6). The Yard sits between the Corridor and the Gate. */
export const SCENES = ['opening', 'cell', 'corridor', 'yard', 'gate', 'dawn'] as const;
export type SceneId = (typeof SCENES)[number];

export interface Progress {
  scene: SceneId;
  learned: SpellId[];
  /** False until the torn song is pieced together in the Cell (it teaches the clap). */
  staffUnlocked: boolean;
  /** The Free melody the player wrote at the Gate, as line indices. */
  signature: number[] | null;
  /** Curiosity indices found so far. */
  curiosities: number[];
}

/** Spells known at the start of each scene, so any scene can be entered directly (?scene=). */
const LEARNED_AT_START: Record<SceneId, readonly SpellId[]> = {
  opening: [],
  cell: [],
  corridor: ['rise'],
  yard: ['rise', 'sleep'],
  gate: ['rise', 'sleep', 'cuckoo'],
  dawn: ['rise', 'sleep', 'cuckoo'],
};

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && (SCENES as readonly string[]).includes(value);
}

export function newProgress(scene: SceneId = 'opening'): Progress {
  return {
    scene,
    learned: [...LEARNED_AT_START[scene]],
    staffUnlocked: LEARNED_AT_START[scene].length > 0,
    signature: null,
    curiosities: [],
  };
}

/** Adds a spell; returns true if it was new. Keeps spell-book order. */
export function learn(p: Progress, id: SpellId): boolean {
  if (p.learned.includes(id)) return false;
  p.learned = SPELLS.map((s) => s.id).filter((s) => s === id || p.learned.includes(s));
  return true;
}

export function nextScene(id: SceneId): SceneId | null {
  const i = SCENES.indexOf(id);
  return i >= 0 && i < SCENES.length - 1 ? SCENES[i + 1] : null;
}

/** Moves to a scene, making sure the spells that scene expects are known. */
export function enterScene(p: Progress, id: SceneId): void {
  p.scene = id;
  for (const s of LEARNED_AT_START[id]) learn(p, s);
  if (p.learned.length > 0) p.staffUnlocked = true;
}

export function addCuriosity(p: Progress, index: number): boolean {
  if (p.curiosities.includes(index)) return false;
  p.curiosities.push(index);
  return true;
}

/** Restores a saved progress object, ignoring anything malformed. */
export function parseProgress(raw: unknown): Progress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isSceneId(r.scene)) return null;
  const p = newProgress(r.scene);
  const ids = SPELLS.map((s) => s.id) as string[];
  if (Array.isArray(r.learned)) for (const s of r.learned) if (ids.includes(s)) learn(p, s as SpellId);
  p.staffUnlocked = r.staffUnlocked === true || p.learned.length > 0;
  if (Array.isArray(r.signature) && r.signature.every((n) => Number.isInteger(n) && n >= 0 && n < 4)) {
    p.signature = r.signature as number[];
  }
  if (Array.isArray(r.curiosities)) p.curiosities = r.curiosities.filter((n): n is number => Number.isInteger(n));
  return p;
}
