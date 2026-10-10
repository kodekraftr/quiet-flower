import type { World } from '@iwsdk/core';
import type { Vector3 } from 'three';

/**
 * Where the player's eyes are and which way they face, in world space.
 * In XR this is the tracked head (updated this frame by the input system);
 * on desktop it is the browser camera.
 */
export function getViewer(world: World, position: Vector3, forward: Vector3): void {
  if (world.session) {
    const head = world.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(position);
    head.getWorldDirection(forward).negate(); // a Group's getWorldDirection is +Z; the viewer looks down -Z
  } else {
    world.camera.updateWorldMatrix(true, false);
    world.camera.getWorldPosition(position);
    world.camera.getWorldDirection(forward);
  }
}
