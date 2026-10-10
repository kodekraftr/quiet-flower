/**
 * The Song of Quiet Flower — week-1 prototype: clap to summon the staff, pinch notes onto it,
 * hold a fist to cast. Ga Ma lifts what you're looking at (Rise); any other
 * melody shows a Curiosity. See README.md for controls and URL options.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { settings } from './config.js';
import { Liftable } from './game-components.js';
import { buildCell } from './scene/cell.js';
import { setupHands, startGame } from './start.js';
import { DebugHudSystem } from './systems/debug-hud.js';
import { EffectsSystem, effects } from './systems/effects.js';
import { HandInputSystem } from './systems/hand-input.js';
import { KeyboardSystem } from './systems/keyboard.js';
import { StaffSystem } from './systems/staff.js';
import { TargetingSystem } from './systems/targeting.js';

const container = document.getElementById('scene-container') as HTMLDivElement;

World.create(container, projectOptions).then(async (world) => {
  setupHands(world);
  const cell = buildCell(await world.assetManager.loadGLTFById('cell'));
  // Persistent so the initial level load doesn't remove them.
  world.createTransformEntity(cell.room, { persistent: true });
  const liftables = [
    { object: cell.pebble, radius: 0.2, liftHeight: 0.3 },
    { object: cell.crate, radius: 0.3, liftHeight: 0.25 },
  ];
  // The door bar is a Rise target in Scene 2's escape; here it just sits in its brackets.
  world.createTransformEntity(cell.doorBar, { persistent: true });
  for (const { object, radius, liftHeight } of liftables) {
    object.userData.liftHeight = liftHeight;
    world.createTransformEntity(object, { persistent: true }).addComponent(Liftable, { radius, liftHeight });
  }
  effects.register({ lantern: cell.lanternCenter, pebble: cell.pebble, dust: cell.dust });

  world.registerSystem(HandInputSystem, { priority: -3 });
  world.registerSystem(TargetingSystem, { priority: -2 });
  world.registerSystem(StaffSystem, { priority: -1 });
  world.registerSystem(KeyboardSystem);
  world.registerSystem(EffectsSystem, { priority: 1 });
  if (settings.debug) world.registerSystem(DebugHudSystem, { priority: 2 });

  startGame(world);
});
