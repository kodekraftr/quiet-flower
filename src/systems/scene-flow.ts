/**
 * Runs the story one scene at a time. Changing scene is an eye blink
 * (storyboard Scene 1: "the view fades to black for half a second and opens
 * again"): a black shell around the head fades in, the old scene unloads, the
 * new one loads, and the shell fades out to the scene's title card.
 * The camera never moves on its own.
 */

import { createSystem } from '@iwsdk/core';
import { BackSide, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { enterScene, nextScene, type SceneId } from '../game/progress.js';
import type { SceneFactory, StoryScene } from '../scenes/scene.js';
import { CanvasText } from '../scene/canvas-text.js';
import { getViewer } from '../scene/viewer.js';
import { progress, sceneRules } from './progress-state.js';
import { staffApi, staffState } from './staff-state.js';

const FADE_OUT_S = 0.45;
const FADE_IN_S = 0.7;
const TITLE_MS = 2800;

type Phase = 'idle' | 'out' | 'loading' | 'in' | 'blink';

/** Filled in by SceneFlowSystem.init(). */
export const sceneFlow = {
  current: null as StoryScene | null,
  /** Registered by src/index.ts before the system starts. */
  factories: {} as Partial<Record<SceneId, SceneFactory>>,
  /** Fallback for scenes not built yet. */
  missing: null as ((id: SceneId) => StoryScene) | null,
  goTo: (_id: SceneId): void => {},
  next: (): void => {},
  /**
   * Rewind (storyboard "caught"): the view ripples to dark gold, `atDark` resets
   * the puzzle while nothing is visible, then the view opens again.
   */
  blink: (_atDark: () => void): void => {},
  /** Called after a scene finishes loading (for saving). */
  onEnter: (_id: SceneId): void => {},
};

export class SceneFlowSystem extends createSystem({}) {
  private readonly shell = new Mesh(
    new SphereGeometry(0.3, 24, 16),
    new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
  );
  private readonly title = new CanvasText(0.46, 0.075, 1100, 180, { background: null, font: `italic 600 92px "Iowan Old Style", "Palatino Linotype", Georgia, serif` });
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private phase: Phase = 'idle';
  private fade = 1;
  private pending: SceneId | null = null;
  private titleUntil = 0;
  /** The loaded scene hasn't begun yet: the player is still on the home screen. */
  private beginPending = false;
  private blinkAt: (() => void) | null = null;

  init(): void {
    this.shell.renderOrder = 1000;
    this.scene.add(this.shell);
    this.title.mesh.renderOrder = 1001;
    this.title.mesh.material.depthTest = false;
    this.title.setOpacity(0);
    this.scene.add(this.title.mesh);
    sceneFlow.goTo = (id) => this.goTo(id);
    sceneFlow.blink = (atDark) => {
      if (this.phase !== 'idle') return;
      this.blinkAt = atDark;
      this.shell.material.color.setHex(0x2a1c08);
      this.phase = 'blink';
    };
    sceneFlow.next = () => {
      const id = sceneFlow.current ? nextScene(sceneFlow.current.id) : null;
      if (id) this.goTo(id);
    };
    this.cleanupFuncs.push(() => {
      this.shell.removeFromParent();
      this.title.mesh.removeFromParent();
      sceneFlow.current?.unload();
    });
  }

  update(delta: number, time: number): void {
    getViewer(this.world, this.eye, this.forward);
    this.shell.position.copy(this.eye);

    switch (this.phase) {
      case 'out':
        this.fade = Math.min(1, this.fade + delta / FADE_OUT_S);
        if (this.fade >= 1) void this.swap();
        break;
      case 'in':
        this.fade = Math.max(0, this.fade - delta / FADE_IN_S);
        if (this.fade <= 0) {
          this.phase = 'idle';
          this.shell.material.color.setHex(0x000000);
        }
        break;
      case 'blink':
        this.fade = Math.min(1, this.fade + delta / 0.9);
        if (this.fade >= 1) {
          staffApi.close();
          staffState.melody.length = 0;
          this.blinkAt?.();
          this.blinkAt = null;
          this.phase = 'in';
        }
        break;
      default:
        break;
    }
    this.shell.material.opacity = this.fade;
    this.shell.visible = this.fade > 0.001;

    if (this.beginPending && this.phase !== 'loading' && document.body.dataset.screen !== 'home') {
      this.beginPending = false;
      this.titleUntil = performance.now() + TITLE_MS;
      sceneFlow.current?.begin?.();
    }
    if (this.phase !== 'loading') sceneFlow.current?.update(delta, time);

    const now = performance.now();
    const left = this.titleUntil - now;
    if (left > 0) {
      const m = this.title.mesh;
      this.forward.y = 0;
      if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
      this.forward.normalize();
      m.position.copy(this.eye).addScaledVector(this.forward, 0.9);
      m.position.y += 0.08;
      m.lookAt(this.eye);
      const age = TITLE_MS - left;
      this.title.setOpacity(Math.min(1, age / 500, left / 700));
    } else {
      this.title.setOpacity(0);
    }
  }

  private goTo(id: SceneId): void {
    if (this.phase === 'out' || this.phase === 'loading') return;
    this.pending = id;
    this.phase = 'out';
  }

  private async swap(): Promise<void> {
    const id = this.pending;
    if (!id) return;
    this.pending = null;
    this.phase = 'loading';
    staffApi.close();
    staffState.melody.length = 0;
    sceneFlow.current?.unload();
    sceneFlow.current = null;
    enterScene(progress, id);
    const factory = sceneFlow.factories[id];
    const next = factory ? await factory() : sceneFlow.missing?.(id);
    if (!next) return;
    sceneRules.allowFree = next.allowFree;
    await next.load(this.world);
    sceneFlow.current = next;
    sceneFlow.onEnter(id);
    this.title.set(next.title, '#F3E6C4');
    this.beginPending = true;
    this.phase = 'in';
  }
}
