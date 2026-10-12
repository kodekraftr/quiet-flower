import { defineComponents } from '@iwsdk/core';
import { Liftable, Listener, NoiseSource, SoundBlocker } from './game-components.js';

export default defineComponents([Liftable, Listener, SoundBlocker, NoiseSource]);
