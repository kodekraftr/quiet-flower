/**
 * /test (test.html): hand-tracking readout. Same hand pipeline as the game
 * (HandInputSystem), no cell and no game systems.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { setupHands, useEmulatedHands } from './start.js';
import { HandInputSystem } from './systems/hand-input.js';
import { HandTestSystem } from './systems/hand-test.js';

const container = document.getElementById('scene-container') as HTMLDivElement;

World.create(container, projectOptions).then((world) => {
  setupHands(world);
  world.registerSystem(HandInputSystem, { priority: -3 });
  world.registerSystem(HandTestSystem);

  const button = document.getElementById('vr-button') as HTMLButtonElement | null;
  const status = document.getElementById('vr-status');
  world.renderer.xr.addEventListener('sessionstart', () => (document.body.dataset.xr = 'on'));
  world.renderer.xr.addEventListener('sessionend', () => (document.body.dataset.xr = 'off'));

  if (useEmulatedHands()) {
    world.launchXR();
    return;
  }
  const xr = navigator.xr;
  void (xr ? xr.isSessionSupported('immersive-vr') : Promise.resolve(false)).then((vr) => {
    if (!button || !status) return;
    if (!vr) {
      status.textContent = 'No VR headset found. Open this page in Meta Quest Browser to see your hands.';
      return;
    }
    status.textContent = 'Put the controllers down and hold your hands in front of you.';
    button.disabled = false;
    button.addEventListener('click', () => world.launchXR());
  });
});
