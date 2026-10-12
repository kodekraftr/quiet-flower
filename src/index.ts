/**
 * The Song of Quiet Flower — entry point. Creates the world, registers the
 * systems (explicit order: hands → targeting → staff → effects), and starts the
 * story at the requested or first scene. Scenes live in src/scenes/.
 * See README.md for controls and URL options.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { settings } from './config.js';
import { comingSoon } from './scenes/coming-soon.js';
import { SCENE_FACTORIES } from './scenes/registry.js';
import { setupHands, startGame } from './start.js';
import { DebugHudSystem } from './systems/debug-hud.js';
import { DesktopLookSystem } from './systems/desktop-look.js';
import { EffectsSystem } from './systems/effects.js';
import { HandInputSystem } from './systems/hand-input.js';
import { HearingSystem } from './systems/hearing.js';
import { HintSystem } from './systems/hints.js';
import { KeyboardSystem } from './systems/keyboard.js';
import { hands } from './input/hand-state.js';
import { applyDebugOverrides, progress } from './systems/progress-state.js';
import { staffState } from './systems/staff-state.js';
import { SceneFlowSystem, sceneFlow } from './systems/scene-flow.js';
import { StaffSystem } from './systems/staff.js';
import { TargetingSystem } from './systems/targeting.js';

const container = document.getElementById('scene-container') as HTMLDivElement;

World.create(container, projectOptions).then((world) => {
  setupHands(world);
  applyDebugOverrides();
  sceneFlow.factories = SCENE_FACTORIES;
  sceneFlow.missing = comingSoon;

  world.registerSystem(HandInputSystem, { priority: -3 });
  world.registerSystem(TargetingSystem, { priority: -2 });
  world.registerSystem(StaffSystem, { priority: -1 });
  world.registerSystem(KeyboardSystem);
  world.registerSystem(DesktopLookSystem);
  world.registerSystem(SceneFlowSystem);
  world.registerSystem(HearingSystem, { priority: 1 });
  world.registerSystem(EffectsSystem, { priority: 1 });
  world.registerSystem(HintSystem, { priority: 2 });
  if (settings.debug) world.registerSystem(DebugHudSystem, { priority: 2 });

  // The Opening (Scene 1) isn't built yet, so a new game starts in the Cell.
  sceneFlow.goTo(settings.scene ?? 'cell');
  // Dev builds only: a handle for the emulator test scripts.
  if (import.meta.env.DEV) Object.assign(window, { __qf: { world, sceneFlow, progress, hands, staffState } });
  startGame(world);
});
