import { AnimatedControllerHand, type InputLayout, type World } from '@iwsdk/core';
import type { Group, PerspectiveCamera, Scene } from 'three';
import { synth } from './audio/synth.js';

/**
 * Draws a held controller as a hand. IWSDK 1.0.1's AnimatedControllerHand takes
 * (model, scene, camera) but the SDK constructs visuals with (scene, camera, model),
 * so this subclass restores the order.
 */
class ControllerAsHand extends AnimatedControllerHand {
  constructor(scene: Scene, camera: PerspectiveCamera, model: Group, layout: InputLayout) {
    super(model, scene, camera, layout);
  }
}

interface EmulatedDevice {
  primaryInputMode: 'controller' | 'hand';
  controlMode: 'manual' | 'programmatic';
}

/**
 * No start page: the game is on screen as soon as it loads.
 *
 * - Quest Browser: IWSDK *offers* the VR session (iwsdk.config.json `offer: "always"`),
 *   so the browser shows its own "Enter VR" prompt straight away, and again after you exit.
 * - The PC emulator (`npm run dev`): enters VR by itself, with emulated hands.
 * - A browser without WebXR: you're already in the cell; the keyboard plays it.
 *
 * The Song of Quiet Flower is played with hands. If someone holds controllers anyway, they are drawn
 * as hands, never as controller models.
 */
export function setupHands(world: World): void {
  // Hand models ship with the game (public/input-profiles, MIT) instead of coming from a CDN,
  // so hands appear even offline.
  const CDN = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/';
  const loader = world.assetManager as unknown as { loadGLTF: (url: string, key?: string) => Promise<unknown> };
  const load = loader.loadGLTF.bind(loader);
  loader.loadGLTF = (url, key) =>
    load(url.startsWith(CDN) ? new URL(`input-profiles/${url.slice(CDN.length)}`, document.baseURI).href : url, key);

  const visuals = world.input.xr.visualAdapters.controller;
  visuals.left.updateVisualImplementation(ControllerAsHand);
  visuals.right.updateVisualImplementation(ControllerAsHand);
}

export function startGame(world: World): void {
  // Browsers only allow audio after a user gesture. Entering VR counts, as does any click or key.
  const unlock = (): void => synth.unlock();
  world.renderer.xr.addEventListener('sessionstart', unlock);
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  const button = document.getElementById('vr-button') as HTMLButtonElement | null;
  const keys = document.getElementById('keys');
  const showFallback = (vrButton: boolean): void => {
    if (keys) keys.style.display = 'block';
    if (button && vrButton) button.style.display = 'block';
  };
  button?.addEventListener('click', () => {
    unlock();
    world.launchXR();
  });
  world.renderer.xr.addEventListener('sessionstart', () => {
    if (button) button.style.display = 'none';
    if (keys) keys.style.display = 'none';
  });

  const emulator = (window as unknown as { IWER_DEVICE?: EmulatedDevice }).IWER_DEVICE;
  if (emulator) {
    emulator.primaryInputMode = 'hand';
    // The emulator's side panels only re-read the input mode when its control mode changes;
    // a quick round-trip makes them show hand poses (pinch, fist…) instead of controller buttons.
    const mode = emulator.controlMode;
    emulator.controlMode = 'programmatic';
    emulator.controlMode = mode;
    world.launchXR();
    world.renderer.xr.addEventListener('sessionend', () => showFallback(true));
    return;
  }

  const xr = navigator.xr;
  if (!xr) {
    showFallback(false);
    return;
  }
  void xr.isSessionSupported('immersive-vr').then((ok) => {
    // Quest Browser supports offerSession, so its own prompt appears; other browsers get our button.
    const canOffer = typeof (xr as XRSystem & { offerSession?: unknown }).offerSession === 'function';
    showFallback(ok && !canOffer);
    world.renderer.xr.addEventListener('sessionend', () => showFallback(ok && !canOffer));
  });
}
