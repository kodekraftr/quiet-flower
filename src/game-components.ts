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

/** Someone a spell can reach if they can hear it (build spec §5). */
export const Listener = createComponent(
  'Listener',
  {
    name: { type: Types.String, default: 'Guard', help: 'Shown in captions' },
    earmuffs: { type: Types.Boolean, default: false, help: 'Ear covering: hears nothing' },
    markerHeight: { type: Types.Float32, default: 2.1, min: 0, max: 4, help: 'Height of the ear marker above the entity origin, metres' },
  },
  'A character who can hear spells',
);

/** Blocks sound while closed (a door). Its box is the object's current bounds. */
export const SoundBlocker = createComponent(
  'SoundBlocker',
  {
    closed: { type: Types.Boolean, default: true, help: 'Only a closed blocker stops sound' },
  },
  'Something that stops sound while closed',
);

/** A loud source (a waterfall) that masks listeners within its radius while active. */
export const NoiseSource = createComponent(
  'NoiseSource',
  {
    radius: { type: Types.Float32, default: 3, min: 0.1, max: 20, help: 'Listeners this close cannot hear spells' },
    active: { type: Types.Boolean, default: true, help: 'False once the noise stops' },
  },
  'A noise that drowns out spells',
);
