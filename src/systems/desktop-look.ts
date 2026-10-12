/**
 * Desktop / phone play without a headset: drag on the scene (or use the arrow
 * keys) to look around, so Rise can be aimed at things. Follows the
 * first-person pattern in the IWSDK browser-first guide: only `world.camera`
 * rotates. Does nothing during an XR session or on the home screen.
 */

import { createSystem } from '@iwsdk/core';
import { Euler } from 'three';

const DRAG_SPEED = 0.004;
const KEY_SPEED = 1.4; // rad/s
const PITCH_LIMIT = 1.25;

export class DesktopLookSystem extends createSystem({}) {
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly keys = { left: false, right: false, up: false, down: false };
  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  init(): void {
    this.euler.setFromQuaternion(this.world.camera.quaternion, 'YXZ');
    this.yaw = this.euler.y;
    this.pitch = this.euler.x;
    const canvas = this.world.renderer.domElement;
    canvas.style.touchAction = 'none';

    const down = (e: PointerEvent): void => {
      if (!this.active()) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * DRAG_SPEED;
      this.pitch += (e.clientY - this.lastY) * DRAG_SPEED;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.apply();
    };
    const up = (): void => {
      this.dragging = false;
    };
    const key = (pressed: boolean) => (e: KeyboardEvent): void => {
      const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key] as keyof typeof this.keys | undefined;
      if (!k) return;
      this.keys[k] = pressed;
      if (pressed && this.active()) e.preventDefault();
    };
    const keyDown = key(true);
    const keyUp = key(false);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    });
  }

  update(delta: number): void {
    if (!this.active()) return;
    const k = this.keys;
    if (!(k.left || k.right || k.up || k.down)) return;
    this.yaw += ((k.left ? 1 : 0) - (k.right ? 1 : 0)) * KEY_SPEED * delta;
    this.pitch += ((k.up ? 1 : 0) - (k.down ? 1 : 0)) * KEY_SPEED * delta;
    this.apply();
  }

  private active(): boolean {
    return !this.world.session && document.body.dataset.screen === 'browser';
  }

  private apply(): void {
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    this.world.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
