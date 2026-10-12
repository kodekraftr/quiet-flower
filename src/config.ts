/**
 * Prototype settings, read once from the page URL so they can be changed
 * on the headset without a rebuild, e.g.
 *   https://<pc>:8081/?notation=western&hold=450&summon=hold&debug=1
 * The full game moves these into the in-game Settings panel.
 */

import type { Notation } from './game/notes.js';
import { isSceneId, type SceneId } from './game/progress.js';

export interface HumSettings {
  notation: Notation;
  /** Fist hold before a cast fires. */
  castHoldMs: number;
  /** 'clap' = clap and pull apart (default); 'hold' also allows one-hand pinch-and-hold. */
  summon: 'clap' | 'hold';
  /** Metres from the eyes to the staff. */
  staffDistance: number;
  /** ?learn=all: every spell known and the staff unlocked from the start. */
  learnAll: boolean;
  /** ?scene=cell (etc.): start in that scene instead of the saved one. */
  scene: SceneId | null;
  debug: boolean;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function readSettings(search: string): HumSettings {
  const q = new URLSearchParams(search);
  const hold = Number(q.get('hold'));
  const dist = Number(q.get('dist'));
  return {
    notation: q.get('notation') === 'western' ? 'western' : 'sargam',
    castHoldMs: inRange(hold, 150, 1000) ? hold : 350,
    summon: q.get('summon') === 'hold' ? 'hold' : 'clap',
    staffDistance: inRange(dist, 30, 70) ? dist / 100 : 0.45,
    learnAll: q.get('learn') === 'all',
    scene: isSceneId(q.get('scene')) ? (q.get('scene') as SceneId) : null,
    debug: q.get('debug') === '1',
  };
}

export const settings: HumSettings = readSettings(window.location.search);
