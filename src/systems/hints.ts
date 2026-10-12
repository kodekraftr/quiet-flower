/**
 * Writes the current step's hint after 45 s without progress: on the song
 * page as the past self's handwriting when there is one, otherwise as a
 * caption. Scenes call `hints.set()` at each step; any `progress` event
 * restarts the wait. With ?debug=1 the wait is 8 s, for testing.
 */

import { createSystem } from '@iwsdk/core';
import { settings } from '../config.js';
import { HINT_DELAY_MS, HintClock } from '../game/hints.js';
import type { HintSurface } from '../scene/scrap-card.js';
import { effects } from './effects.js';
import { game } from './progress-state.js';

const clock = new HintClock(settings.debug ? 8000 : HINT_DELAY_MS);

export const hints = {
  /** Where handwritten hints appear (null: shown as a caption). */
  page: null as HintSurface | null,
  set(text: string | null): void {
    clock.set(text, performance.now());
    if (hints.page && hints.page.margins.hint) {
      hints.page.margins.hint = null;
      hints.page.redraw();
    }
  },
};

export class HintSystem extends createSystem({}) {
  init(): void {
    this.cleanupFuncs.push(game.on('progress', () => clock.poke(performance.now())));
  }

  update(): void {
    const text = clock.due(performance.now());
    if (!text) return;
    if (hints.page) {
      hints.page.margins.hint = text;
      hints.page.redraw();
      effects.say('New writing appears on the page…', undefined, 2400);
    } else {
      effects.say(text, undefined, 6000);
    }
  }
}
