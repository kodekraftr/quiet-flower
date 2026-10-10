/**
 * The four staff lines. Spells are stored as line indices (0 = bottom line),
 * so the notation setting only changes names and pitches, never melodies.
 * Pure module: no Three.js, safe to unit-test.
 */

export type Notation = 'sargam' | 'western';

export const LINE_COUNT = 4;

/** Line colours, bottom → top. They differ in lightness as well as hue. */
export const LINE_COLORS = [0xf2c14e, 0xe0664f, 0x3fb8a8, 0x9a86ff] as const;
export const LINE_COLOR_CSS = ['#F2C14E', '#E0664F', '#3FB8A8', '#9A86FF'] as const;

/** Each line also has its own shape, so colour is never the only cue. */
export const LINE_SHAPES = ['circle', 'triangle', 'square', 'diamond'] as const;

const NAMES: Record<Notation, readonly string[]> = {
  sargam: ['Sa', 'Re', 'Ga', 'Ma'],
  western: ['A', 'B♭', 'C', 'D'],
};

/** Hz. Sargam: Sa = C4. Western: the storyboard's A3 B♭3 C4 D4. */
const FREQUENCIES: Record<Notation, readonly number[]> = {
  sargam: [261.63, 293.66, 329.63, 349.23],
  western: [220.0, 233.08, 261.63, 293.66],
};

function checkLine(line: number): void {
  if (!Number.isInteger(line) || line < 0 || line >= LINE_COUNT) {
    throw new RangeError(`Staff line must be an integer 0–${LINE_COUNT - 1}, got ${line}`);
  }
}

export function noteName(line: number, notation: Notation): string {
  checkLine(line);
  return NAMES[notation][line];
}

export function noteFrequency(line: number, notation: Notation): number {
  checkLine(line);
  return FREQUENCIES[notation][line];
}

export function melodyNames(lines: readonly number[], notation: Notation): string {
  return lines.map((l) => noteName(l, notation)).join(' ');
}
