/**
 * Scene 3 — The Corridor (storyboard). The hearing rule's first puzzle:
 *   1. Scrap 3 lies on the floor: look at it and pinch. Sleep (Ma Ga Re) is
 *      learned and Re unlocks.
 *   2. Tolo dozes half-awake at his table; Senn plays dice in the guardroom
 *      behind a closed door. Sleep straight away reaches only Tolo: Senn's ear
 *      is struck out (the door). He notices Tolo has gone quiet, comes out
 *      after 10 s and catches the player → rewind.
 *   3. Rise on the guardroom's latch bar opens the door (Senn starts to get
 *      up), then Sleep reaches both guards.
 *   4. With both asleep, look at the ore cart and pinch its rim to climb in.
 *      Trying while anyone is awake gets the player caught.
 *   Hint after 45 s: "Sound stops at closed doors."
 */

import type { Entity, World } from '@iwsdk/core';
import {
  BoxGeometry,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PointLight,
  Quaternion,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { synth } from '../audio/synth.js';
import { settings } from '../config.js';
import { GuardBrain } from '../game/guard-ai.js';
import { findSpell } from '../game/spells.js';
import { Liftable, Listener, SoundBlocker } from '../game-components.js';
import { COMMON_FLATS, prepareBakedRoom, takeNodes } from '../scene/baked-room.js';
import { Figure, type FigureName } from '../scene/figure.js';
import { LookPinch } from '../scene/look-pinch.js';
import { readingSpot, ScrapCard } from '../scene/scrap-card.js';
import { effects } from '../systems/effects.js';
import { hearing } from '../systems/hearing.js';
import { hints } from '../systems/hints.js';
import { game, learn, progress } from '../systems/progress-state.js';
import { sceneFlow } from '../systems/scene-flow.js';
import { staffState } from '../systems/staff-state.js';
import type { StoryScene } from './scene.js';

type Stage = 'scrap' | 'puzzle' | 'leaving';

const ALERT_SECONDS = 10;
const CAUGHT_BLINK_MS = 1400;
const DOOR_OPEN_ANGLE = -1.35;
const DOOR_S = 1.6;
const SPEECH = '#E8D9B8';
const SLEEP = findSpell('sleep');

const P = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
const PLAYER = P(0, 0, 0);

interface Guard {
  name: string;
  brain: GuardBrain;
  figure: Figure;
  entity: Entity;
  home: Vector3;
  setup(f: Figure): void;
}

export class CorridorScene implements StoryScene {
  readonly id = 'corridor' as const;
  readonly title = 'The Corridor';
  readonly allowFree = false;

  private world!: World;
  private readonly entities: Entity[] = [];
  private readonly shared: Entity[] = [];
  private readonly offs: (() => void)[] = [];
  private stage: Stage = 'scrap';
  private scrap!: ScrapCard;
  private scrapPick!: LookPinch;
  private cartPick!: LookPinch;
  private latchBar!: Object3D;
  private door!: Object3D;
  private blocker!: Entity;
  private tolo!: Guard;
  private senn!: Guard;
  private doorT = 0;
  private doorOpening = false;
  private caughtAt = 0;
  private sleepLearnedShown = false;
  private scrapFlight = -1;
  private readonly scrapFrom = new Vector3();
  private readonly scrapTo = new Vector3();
  private readonly scrapFromQ = new Quaternion();
  private readonly scrapToQ = new Quaternion();
  private readonly v = new Vector3();

  async load(world: World): Promise<void> {
    this.world = world;
    const [room, figs] = await Promise.all([world.assetManager.loadGLTFById('corridor'), world.assetManager.loadGLTFById('figures')]);
    const root = room.scene.clone(true);
    prepareBakedRoom(root, COMMON_FLATS);
    const nodes = takeNodes(root, 'corridor.glb', ['guard_door', 'latch_bar']);
    this.door = nodes.guard_door;
    this.latchBar = nodes.latch_bar;
    this.entities.push(world.createTransformEntity(root, { persistent: true }));
    this.latchBar.userData.liftHeight = 0.3;
    this.entities.push(world.createTransformEntity(this.latchBar, { persistent: true }).addComponent(Liftable, { radius: 0.3, liftHeight: 0.3 }));
    this.entities.push(world.createTransformEntity(this.door, { persistent: true }));

    // The guardroom's whole front (wall and door) stops sound while the door is shut.
    const wall = new Mesh(new BoxGeometry(0.3, 2.6, 5.0), new MeshBasicMaterial());
    wall.position.set(1.45, 1.3, -4.0);
    wall.visible = false;
    this.blocker = world.createTransformEntity(wall, { persistent: true }).addComponent(SoundBlocker, { closed: true });
    this.entities.push(this.blocker);

    // Real-time light for the characters only (the room itself is baked and unlit).
    const lights: Object3D[] = [new HemisphereLight(0x8090b0, 0x201810, 0.9)];
    for (const [x, y, z, i] of [[-1.25, 1.9, -1.0, 6], [1.25, 1.9, -1.6, 6], [-1.25, 1.9, -5.6, 6], [2.75, 1.3, -4.55, 5]]) {
      const l = new PointLight(0xffa860, i, 7, 1.6);
      l.position.set(x, y, z);
      lights.push(l);
    }
    for (const l of lights) this.entities.push(world.createTransformEntity(l, { persistent: true }));

    this.tolo = this.makeGuard(figs, 'tolo', 'Tolo', P(-0.75, 0, -4.17), (f) => {
      f.sit = 1;
      f.armsOnTable = 1;
      f.nodding = true;
      f.doze = 0;
      f.point = 0;
    });
    this.senn = this.makeGuard(figs, 'senn', 'Senn', P(2.6, 0, -5.2), (f) => {
      f.sit = 1;
      f.armsOnTable = 1;
      f.dice = true;
      f.doze = 0;
      f.point = 0;
    });

    this.scrap = new ScrapCard(SLEEP.lines, 'sleep', settings.notation, 3);
    this.scrap.group.position.set(0.35, 0.03, -0.95);
    this.scrap.group.rotation.set(-Math.PI / 2, 0, 0.4);
    this.entities.push(world.createTransformEntity(this.scrap.group, { persistent: true }));
    this.scrapPick = new LookPinch(this.scrap.group.position, 0.45, (20 * Math.PI) / 180);
    this.cartPick = new LookPinch(P(0, 0.92, -6.3), 1.2, (12 * Math.PI) / 180);
    this.cartPick.enabled = false;
    for (const o of [this.scrapPick.glow, this.cartPick.glow]) this.entities.push(world.createTransformEntity(o, { persistent: true }));

    this.offs.push(
      game.on('heard', ({ spell, listener }) => {
        if (spell !== 'sleep') return;
        const g = listener === this.tolo.entity ? this.tolo : listener === this.senn.entity ? this.senn : null;
        if (g) this.putToSleep(g);
      }),
      game.on('cast', ({ result }) => {
        if (result.kind === 'spell' && result.spell.id === 'sleep' && !this.sleepLearnedShown) {
          this.sleepLearnedShown = true;
          window.setTimeout(() => effects.say('Spell learned: Sleep', '#F7D27A', 3000), 2900);
        }
      }),
      game.on('rise', ({ target, lifted }) => {
        if (target === this.latchBar && lifted && this.doorT === 0 && !this.doorOpening) {
          this.openDoor();
          game.emit('progress', 'guardroom door opened');
          if (this.senn.brain.alert(ALERT_SECONDS)) this.speak('Senn', 'Hm? Who opened that?');
        }
      }),
    );

    if (progress.learned.includes('sleep') && settings.learnAll) this.takeScrap(true);
  }

  begin(): void {
    this.setStage(this.stage);
    if (this.stage === 'scrap') effects.say('Out of the cell… and another scrap of my song on the floor.', undefined, 4200);
  }

  unload(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    hints.page = null;
    hints.set(null);
    effects.clear();
    for (const e of this.shared) e.destroy();
    for (const e of this.entities) e.dispose();
    this.shared.length = 0;
    this.entities.length = 0;
  }

  interact(): void {
    if (this.stage === 'scrap') this.takeScrap(false);
    else if (this.stage === 'puzzle') this.tryCart();
  }

  update(delta: number, time: number): void {
    const now = performance.now();
    const dt = delta * staffState.timeScale;

    if (this.stage === 'scrap' && this.scrapPick.update(this.world, now)) this.takeScrap(false);
    if (this.stage === 'puzzle' && this.cartPick.update(this.world, now)) this.tryCart();
    this.updateScrapFlight(delta);

    for (const g of [this.tolo, this.senn]) {
      const ev = this.caughtAt ? null : g.brain.update(dt);
      if (ev === 'go-check') this.goCheck(g);
      else if (ev === 'woke') this.wake(g);
      g.figure.update(dt, time);
    }
    if (!this.caughtAt && this.senn.brain.state === 'checking' && !this.senn.figure.walking) this.caught(this.senn);

    if (this.doorOpening) {
      this.doorT = Math.min(1, this.doorT + delta / DOOR_S);
      this.door.rotation.y = DOOR_OPEN_ANGLE * (1 - (1 - this.doorT) ** 3);
      if (this.doorT >= 1) this.doorOpening = false;
    }
  }

  // ── Steps ───────────────────────────────────────────────────────────

  private setStage(stage: Stage): void {
    this.stage = stage;
    if (stage === 'scrap') {
      hints.page = null;
      hints.set('A scrap of my song lies on the floor. Look at it and pinch.');
    } else if (stage === 'puzzle') {
      hints.page = this.scrap;
      hints.set('Sound stops at closed doors.');
      this.cartPick.enabled = true;
    }
  }

  private takeScrap(instant: boolean): void {
    if (this.stage !== 'scrap') return;
    this.scrapPick.enabled = false;
    learn('sleep');
    synth.tick();
    game.emit('progress', 'scrap 3 taken');
    const g = this.scrap.group;
    this.scrapFrom.copy(g.position);
    this.scrapFromQ.copy(g.quaternion);
    readingSpot(this.world, this.scrapTo, this.v);
    g.position.copy(this.scrapTo);
    g.lookAt(this.v);
    this.scrapToQ.copy(g.quaternion);
    if (instant) {
      this.scrapFlight = -1;
    } else {
      g.position.copy(this.scrapFrom);
      g.quaternion.copy(this.scrapFromQ);
      this.scrapFlight = 0;
      effects.say('Ma, Ga, Re… the notes hum on the paper.', undefined, 3200);
    }
    this.setStage('puzzle');
  }

  private updateScrapFlight(delta: number): void {
    if (this.scrapFlight < 0) return;
    this.scrapFlight = Math.min(1, this.scrapFlight + delta / 1.1);
    const k = this.scrapFlight;
    const e = k * k * (3 - 2 * k);
    const g = this.scrap.group;
    g.position.lerpVectors(this.scrapFrom, this.scrapTo, e);
    g.position.y += Math.sin(k * Math.PI) * 0.15;
    g.quaternion.slerpQuaternions(this.scrapFromQ, this.scrapToQ, e);
    this.scrap.margins.glow = Math.sin(k * Math.PI);
    this.scrap.redraw();
    if (k >= 1) this.scrapFlight = -1;
  }

  private putToSleep(g: Guard): void {
    if (this.caughtAt) return;
    if (!g.brain.sleep()) return;
    g.figure.doze = 1;
    g.figure.nodding = false;
    g.figure.dice = false;
    g.figure.point = 0;
    hearing.setAsleep(g.entity, true);
    game.emit('progress', `${g.name} asleep`);
    if (g === this.tolo && this.senn.brain.alert(ALERT_SECONDS)) {
      window.setTimeout(() => this.speak('Senn', '(from the guardroom) Tolo? …You\'ve gone very quiet.'), 2500);
    }
    if (this.tolo.brain.asleep && this.senn.brain.asleep) {
      hints.set('Both guards sleep. The cart waits at the end of the corridor: look at it and pinch its rim.');
      effects.say('Both asleep. The cart…', undefined, 3000);
    }
  }

  private goCheck(g: Guard): void {
    if (g !== this.senn) return;
    if (this.doorT === 0 && !this.doorOpening) {
      // He lifts the latch from inside and pushes the door open.
      effects.resetLift(this.latchBar);
      this.latchBar.position.y += 0.3;
      this.openDoor();
    }
    g.figure.dice = false;
    g.figure.armsOnTable = 0;
    g.figure.walkTo([P(2.0, 0, -4.95), P(1.95, 0, -3.3), P(1.5, 0, -2.9), P(0.85, 0, -2.75)]);
    this.speak('Senn', 'Something\'s not right out there…');
  }

  private wake(g: Guard): void {
    hearing.setAsleep(g.entity, false);
    g.figure.doze = 0;
    this.caught(g);
  }

  private tryCart(): void {
    if (this.stage !== 'puzzle' || this.caughtAt) return;
    const awake = [this.tolo, this.senn].find((g) => !g.brain.asleep);
    if (awake) {
      this.caught(awake);
      return;
    }
    this.stage = 'leaving';
    this.cartPick.enabled = false;
    hints.set(null);
    synth.tick();
    effects.say('Into the cart. Quietly…', undefined, 2400);
    game.emit('progress', 'left in the cart');
    window.setTimeout(() => sceneFlow.next(), 1500);
  }

  private caught(g: Guard): void {
    if (this.caughtAt) return;
    this.caughtAt = performance.now();
    hearing.setAsleep(g.entity, false);
    g.figure.doze = 0;
    g.figure.sit = 0;
    g.figure.armsOnTable = 0;
    g.figure.face(PLAYER);
    g.figure.point = 1;
    synth.thud();
    this.speak(g.name, 'Hey! The prisoner\'s out!');
    window.setTimeout(() => {
      sceneFlow.blink(() => this.rewind());
    }, CAUGHT_BLINK_MS);
  }

  /** Back to the start of the puzzle (the scrap and Sleep are kept). */
  private rewind(): void {
    for (const g of [this.tolo, this.senn]) {
      g.brain.reset();
      hearing.setAsleep(g.entity, false);
      g.setup(g.figure);
      g.figure.snap(g.home, PLAYER);
    }
    this.doorT = 0;
    this.doorOpening = false;
    this.door.rotation.y = 0;
    effects.resetLift(this.latchBar);
    this.blocker.setValue(SoundBlocker, 'closed', true);
    this.caughtAt = 0;
    this.stage = 'puzzle';
    this.cartPick.enabled = true;
    hints.set('Sound stops at closed doors.');
    window.setTimeout(() => effects.say('…the moment unwinds. Try again.', undefined, 2800), 300);
  }

  private openDoor(): void {
    this.doorOpening = true;
    this.blocker.setValue(SoundBlocker, 'closed', false);
    synth.whoosh(false);
  }

  private speak(who: string, line: string): void {
    synth.thud();
    effects.say(`${who}: ${line}`, SPEECH, 3200);
  }

  private makeGuard(figs: GLTF, name: FigureName, label: string, home: Vector3, setup: (f: Figure) => void): Guard {
    const figure = new Figure(figs, name, home, PLAYER);
    setup(figure);
    figure.snap(home, PLAYER);
    const entity = this.world
      .createTransformEntity(figure.root, { persistent: true })
      .addComponent(Listener, { name: label, markerHeight: 2.05 });
    this.shared.push(entity);
    return { name: label, brain: new GuardBrain(), figure, entity, home, setup };
  }
}
