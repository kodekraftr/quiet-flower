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
 * The page opens on a home screen over the live cell (index.html #home).
 *
 * - Quest Browser: "Enter VR" on the home screen. IWSDK also *offers* the session
 *   (iwsdk.config.json `offer: "always"`), so the browser's own prompt works too.
 * - The PC emulator (`npm run dev`): skips the home screen and enters VR with emulated hands.
 * - A browser without WebXR: "Play in browser" drops you into the cell; the keyboard plays it.
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

  world.renderer.xr.addEventListener('sessionstart', () => setScreen('xr'));
  world.renderer.xr.addEventListener('sessionend', () => setScreen('home'));

  const emulator = (window as unknown as { IWER_DEVICE?: EmulatedDevice }).IWER_DEVICE;
  if (emulator) {
    emulator.primaryInputMode = 'hand';
    // The emulator's side panels only re-read the input mode when its control mode changes;
    // a quick round-trip makes them show hand poses (pinch, fist…) instead of controller buttons.
    const mode = emulator.controlMode;
    emulator.controlMode = 'programmatic';
    emulator.controlMode = mode;
    setScreen('xr');
    world.launchXR();
  }

  const play = document.getElementById('play-button') as HTMLButtonElement | null;
  const label = document.getElementById('play-label');
  const hint = document.getElementById('play-hint');
  const dialog = document.getElementById('how-dialog') as HTMLDialogElement | null;
  document.getElementById('how-button')?.addEventListener('click', () => dialog?.showModal());
  document.getElementById('menu-button')?.addEventListener('click', () => setScreen('home'));

  const xr = navigator.xr;
  void (xr ? xr.isSessionSupported('immersive-vr') : Promise.resolve(false)).then((vr) => {
    if (!play || !label || !hint) return;
    label.textContent = vr ? 'Enter VR' : 'Play in browser';
    hint.textContent = vr
      ? 'Sit down, put the controllers away and use your hands.'
      : 'No VR headset found. You can still look around the cell and cast with the keyboard.';
    play.disabled = false;
    play.addEventListener('click', () => {
      unlock();
      if (vr) world.launchXR();
      else setScreen('browser');
    });
  });
}

/** Which page overlay is showing; index.html's CSS keys off body[data-screen]. */
function setScreen(screen: 'home' | 'browser' | 'xr'): void {
  document.body.dataset.screen = screen;
}
