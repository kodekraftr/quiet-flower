/**
 * Keyboard fallback for testing on a computer (browser or IWER emulator),
 * where clapping and fist-holding can't be done:
 *   Space = summon/dismiss · 1–4 = add Sa/Re/Ga/Ma · Backspace = remove last
 *   Enter = cast · Esc = dismiss · P = the scene's pinch interaction
 *   (open the bag, place the next torn piece, …)
 */

import { createSystem } from '@iwsdk/core';
import { sceneFlow } from './scene-flow.js';
import { staffApi } from './staff-state.js';

export class KeyboardSystem extends createSystem({}) {
  init(): void {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Keys on the home screen belong to its buttons, not the game.
      if (document.body.dataset.screen === 'home') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          staffApi.toggle();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          staffApi.appendLine(Number(e.key) - 1);
          break;
        case 'Backspace':
          e.preventDefault();
          staffApi.removeLast();
          break;
        case 'Enter':
          staffApi.cast();
          break;
        case 'Escape':
          staffApi.close();
          break;
        case 'p':
        case 'P':
          sceneFlow.current?.interact?.();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
  }
}
