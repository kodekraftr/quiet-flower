/**
 * Stand-in for a scene that isn't built yet: darkness and a card saying what
 * comes next, so the story never dead-ends during development.
 */

import type { Entity, World } from '@iwsdk/core';
import { Vector3 } from 'three';
import type { SceneId } from '../game/progress.js';
import { CanvasText } from '../scene/canvas-text.js';
import { getViewer } from '../scene/viewer.js';
import type { StoryScene } from './scene.js';

const TITLES: Record<SceneId, string> = {
  opening: 'The Opening',
  cell: 'The Cell',
  corridor: 'The Corridor',
  yard: 'The Yard',
  gate: 'The Gate',
  dawn: 'Dawn',
};

export function comingSoon(id: SceneId): StoryScene {
  let world: World;
  let entity: Entity | null = null;
  const card = new CanvasText(0.6, 0.16, 1400, 380, { background: 'rgba(8,12,18,0.8)' });
  const eye = new Vector3();
  const forward = new Vector3();
  return {
    id,
    title: TITLES[id],
    allowFree: id === 'gate',
    async load(w) {
      world = w;
      card.set(`${TITLES[id]}\nComing in the next build.\nThank you for playing this far.`, '#F3E6C4');
      entity = world.createTransformEntity(card.mesh, { persistent: true });
    },
    update() {
      getViewer(world, eye, forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      card.mesh.position.copy(eye).addScaledVector(forward, 1.1);
      card.mesh.lookAt(eye);
    },
    unload() {
      entity?.dispose();
      entity = null;
    },
  };
}

export { TITLES as SCENE_TITLES };
