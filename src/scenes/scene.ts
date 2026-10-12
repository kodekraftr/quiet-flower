/**
 * One story scene (storyboard §Storyboard). SceneFlowSystem loads one at a
 * time, calls `update` every frame, and blinks to the next when the scene
 * calls `sceneFlow.next()`.
 */

import type { World } from '@iwsdk/core';
import type { SceneId } from '../game/progress.js';

export interface StoryScene {
  readonly id: SceneId;
  /** Shown on the title card as the scene opens. */
  readonly title: string;
  /** Can the player-written Free spell be cast here (only the Gate)? */
  readonly allowFree: boolean;
  load(world: World): Promise<void>;
  /**
   * The player is actually here now (they left the home screen, or the scene
   * was entered from another scene): start subtitles, hints and timers.
   */
  begin?(): void;
  update(delta: number, time: number): void;
  unload(): void;
  /** Desktop / emulator fallback for the scene's current hand interaction (the P key). */
  interact?(): void;
}

export type SceneFactory = () => Promise<StoryScene>;
