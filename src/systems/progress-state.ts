/**
 * The live story state and the game's event bus, shared by every system and
 * scene. Pure rules live in src/game/progress.ts.
 */

import type { Entity } from '@iwsdk/core';
import type { Object3D } from 'three';
import { settings } from '../config.js';
import { Emitter } from '../game/emitter.js';
import { addCuriosity, learn as learnSpell, newProgress, type Progress } from '../game/progress.js';
import { SPELLS, type CastResult, type SpellId } from '../game/spells.js';

export interface GameEvents extends Record<string, unknown> {
  /** Rise landed on an object (lifted = true when it went up). */
  rise: { target: Object3D; lifted: boolean };
  /** A cast finished playing and its effect landed. */
  cast: { result: CastResult };
  /** A listener heard a spell (fired once per listener who could hear). */
  heard: { spell: SpellId | 'free'; listener: Entity };
  /** A spell was added to the book. */
  learned: SpellId;
  staff: { open: boolean };
  /** The player did something that moves the puzzle on (resets the hint timer). */
  progress: string;
}

export const game = new Emitter<GameEvents>();

export const progress: Progress = newProgress('cell');

/** Scene rules the staff needs: can the player-written Free spell be cast here? */
export const sceneRules = { allowFree: false };

export function learn(id: SpellId): void {
  if (!learnSpell(progress, id)) return;
  progress.staffUnlocked = true;
  game.emit('learned', id);
}

export function foundCuriosity(index: number): boolean {
  return addCuriosity(progress, index);
}

/** ?learn=all: the whole spell book, for testing any scene. */
export function applyDebugOverrides(): void {
  if (!settings.learnAll) return;
  for (const s of SPELLS) learnSpell(progress, s.id);
  progress.staffUnlocked = true;
}
