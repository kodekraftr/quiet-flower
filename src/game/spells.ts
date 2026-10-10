/**
 * Spell data and melody matching (build spec §3). Pure module.
 *
 * Matching is EXACT on the whole melody, so a prefix (Rise = Ga Ma inside
 * Cuckoo = Ga Ma Ga Re Sa) never casts the shorter spell, and a known spell
 * that happens to use all four lines (Cuckoo) is never treated as Free.
 */

import { LINE_COUNT } from './notes.js';

export type SpellId = 'rise' | 'sleep' | 'cuckoo';

export interface SpellDef {
  readonly id: SpellId;
  readonly name: string;
  /** Line indices, bottom line = 0. */
  readonly lines: readonly number[];
  /** Beats per note, played back by the game; never placed by the player. */
  readonly rhythm: readonly number[];
  readonly target: 'object' | 'listeners';
}

export const MAX_BEATS = 6;
export const FREE_MIN_NOTES = 4;
export const FREE_MAX_NOTES = 6;

export const SPELLS: readonly SpellDef[] = [
  { id: 'rise', name: 'Rise', lines: [2, 3], rhythm: [1, 1], target: 'object' },
  { id: 'sleep', name: 'Sleep', lines: [3, 2, 1], rhythm: [1, 1, 2], target: 'listeners' },
  { id: 'cuckoo', name: 'Cuckoo', lines: [2, 3, 2, 1, 0], rhythm: [1.5, 1.5, 1.5, 1, 0.5], target: 'listeners' },
];

/**
 * Small harmless effects for melodies that are not spells. The prototype
 * implements these three; the full game grows the list to 12.
 */
export const CURIOSITIES = ['The lamp flickers', 'The pebble hums', 'Moths circle the lantern'] as const;

export type CastResult =
  | { kind: 'empty' }
  | { kind: 'spell'; spell: SpellDef }
  | { kind: 'free' }
  | { kind: 'curiosity'; index: number };

export function sameMelody(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function usesAllLines(lines: readonly number[]): boolean {
  const seen = new Set(lines);
  for (let l = 0; l < LINE_COUNT; l++) if (!seen.has(l)) return false;
  return true;
}

/** FNV-1a over the melody: the same melody always gives the same curiosity. */
export function melodyHash(lines: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const l of lines) {
    h ^= l + 1;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= lines.length;
  return Math.imul(h, 0x01000193) >>> 0;
}

export function findSpell(id: SpellId): SpellDef {
  const spell = SPELLS.find((s) => s.id === id);
  if (!spell) throw new Error(`Unknown spell ${id}`);
  return spell;
}

/**
 * @param lines   the melody on the staff, left to right
 * @param learned spells the player has found so far
 * @param allowFree true only where the scene allows the player-written spell (the Gate)
 */
export function matchMelody(
  lines: readonly number[],
  learned: readonly SpellId[],
  allowFree: boolean,
  curiosityCount: number = CURIOSITIES.length,
): CastResult {
  if (lines.length === 0) return { kind: 'empty' };

  for (const spell of SPELLS) {
    if (learned.includes(spell.id) && sameMelody(lines, spell.lines)) {
      return { kind: 'spell', spell };
    }
  }

  const isAnySpell = SPELLS.some((s) => sameMelody(lines, s.lines));
  if (
    allowFree &&
    !isAnySpell &&
    lines.length >= FREE_MIN_NOTES &&
    lines.length <= FREE_MAX_NOTES &&
    usesAllLines(lines)
  ) {
    return { kind: 'free' };
  }

  return { kind: 'curiosity', index: melodyHash(lines) % Math.max(1, curiosityCount) };
}

/** Beats to play back: the spell's own rhythm, otherwise even beats. */
export function rhythmFor(result: CastResult, noteCount: number): number[] {
  if (result.kind === 'spell') return [...result.spell.rhythm];
  return new Array<number>(noteCount).fill(1);
}

/** Lines the player can use, given the spells they have learned. */
export function unlockedLines(learned: readonly SpellId[]): number[] {
  const set = new Set<number>();
  for (const spell of SPELLS) if (learned.includes(spell.id)) spell.lines.forEach((l) => set.add(l));
  return [...set].sort((a, b) => a - b);
}
