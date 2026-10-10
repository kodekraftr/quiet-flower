import { createComponent, Types } from '@iwsdk/core';

/** An object Rise can lift. Targeted by looking at it (head direction). */
export const Liftable = createComponent(
  'Liftable',
  {
    radius: { type: Types.Float32, default: 0.25, min: 0.05, max: 2, help: 'Targeting radius in metres (bigger = easier to aim at)' },
    liftHeight: { type: Types.Float32, default: 0.3, min: 0.05, max: 2, help: 'How far Rise lifts it, in metres' },
  },
  'Something the Rise spell can lift',
);
