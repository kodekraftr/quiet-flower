/**
 * Which scenes exist. Scenes load on demand (dynamic import), so the first
 * download only carries the scene the player starts in.
 */

import type { SceneId } from '../game/progress.js';
import type { SceneFactory } from './scene.js';

export const SCENE_FACTORIES: Partial<Record<SceneId, SceneFactory>> = {
  cell: async () => new (await import('./cell-scene.js')).CellScene(),
};
