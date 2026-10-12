/**
 * A torn scrap of the player's song (storyboard: "each spell is a torn piece
 * of the player's own song, … scattered through the prison"). Real notation
 * with note heads coloured to match the staff lines, the note names under
 * them, a small drawing of what the spell does, and room for the past self's
 * handwritten hints.
 */

import type { World } from '@iwsdk/core';
import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { LINE_COLOR_CSS, noteName, type Notation } from '../game/notes.js';
import { getViewer } from './viewer.js';

export const SCRAP_W = 0.22;
export const SCRAP_H = 0.15;
const PX_W = 768;
const PX_H = Math.round((PX_W * SCRAP_H) / SCRAP_W);
const INK = '#3a2d1e';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

export type ScrapDrawing = 'sleep' | 'cuckoo' | 'blank';

/** Something hints can be written on (the song page or a scrap). */
export interface HintSurface {
  readonly margins: { hint: string | null };
  redraw(): void;
}

export class ScrapCard implements HintSurface {
  readonly group = new Group();
  readonly margins: { hint: string | null; glow: number } = { hint: null, glow: 0 };
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private key = '';

  /**
   * @param lines   the spell's notes as staff lines (empty for the unfinished last scrap)
   * @param drawing what the margin sketch shows
   * @param seed    varies the torn outline
   */
  constructor(
    private readonly lines: readonly number[],
    private readonly drawing: ScrapDrawing,
    private notation: Notation,
    private readonly seed = 1,
  ) {
    this.canvas.width = PX_W;
    this.canvas.height = PX_H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mesh = new Mesh(
      new PlaneGeometry(SCRAP_W, SCRAP_H),
      new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide, toneMapped: false, alphaTest: 0.5 }),
    );
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.redraw();
  }

  redraw(): void {
    const key = `${this.notation}|${this.margins.hint}|${Math.round(this.margins.glow * 10)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.g;
    g.clearRect(0, 0, PX_W, PX_H);
    // torn outline
    g.save();
    g.beginPath();
    const n = 40;
    const jag = (i: number): number => 6 + 6 * Math.sin(i * 2.7 + this.seed * 3.1) + 4 * Math.sin(i * 7.3 + this.seed);
    for (let i = 0; i <= n; i++) g.lineTo((PX_W * i) / n, jag(i));
    for (let i = 0; i <= n / 2; i++) g.lineTo(PX_W - jag(i + 50), (PX_H * i) / (n / 2));
    for (let i = n; i >= 0; i--) g.lineTo((PX_W * i) / n, PX_H - jag(i + 100));
    for (let i = n / 2; i >= 0; i--) g.lineTo(jag(i + 150), (PX_H * i) / (n / 2));
    g.closePath();
    g.clip();
    g.fillStyle = '#e8dbbd';
    g.fillRect(0, 0, PX_W, PX_H);
    const edge = g.createRadialGradient(PX_W / 2, PX_H / 2, PX_H * 0.3, PX_W / 2, PX_H / 2, PX_W * 0.6);
    edge.addColorStop(0, 'rgba(90,60,25,0)');
    edge.addColorStop(1, 'rgba(90,60,25,0.35)');
    g.fillStyle = edge;
    g.fillRect(0, 0, PX_W, PX_H);

    // staff
    const x0 = 70;
    const x1 = 470;
    const bottom = 200;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(x0 - 30, bottom - i * 18);
      g.lineTo(x1, bottom - i * 18 + Math.sin(i + this.seed) * 1.5);
      g.stroke();
    }
    if (this.lines.length === 0) {
      g.fillStyle = 'rgba(58,45,30,0.55)';
      g.font = `italic 30px ${HAND}`;
      g.fillText('…', 250, bottom - 30);
    }
    const dx = (x1 - x0 - 40) / Math.max(1, this.lines.length);
    this.lines.forEach((line, i) => {
      const x = x0 + 30 + i * dx;
      const y = bottom + 9 - line * 9;
      if (this.margins.glow > 0) {
        g.save();
        g.shadowColor = LINE_COLOR_CSS[line];
        g.shadowBlur = 10 + this.margins.glow * 30;
        g.fillStyle = LINE_COLOR_CSS[line];
        g.beginPath();
        g.ellipse(x, y, 20, 15, -0.35, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.fillStyle = LINE_COLOR_CSS[line];
      g.beginPath();
      g.ellipse(x, y, 13, 10, -0.35, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(x + 12, y - 2);
      g.lineTo(x + 12, y - 58);
      g.stroke();
      g.fillStyle = INK;
      g.font = `600 28px ${HAND}`;
      g.textAlign = 'center';
      g.fillText(noteName(line, this.notation), x, bottom + 52);
      g.textAlign = 'left';
    });

    this.sketch(g, 610, 150);

    if (this.margins.hint) {
      g.fillStyle = '#5a3b1c';
      g.font = `italic 28px ${HAND}`;
      this.wrap(this.margins.hint, 50, 330, 660, 34);
    }
    g.restore();
    this.texture.needsUpdate = true;
  }

  private sketch(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.strokeStyle = '#5a3b1c';
    g.fillStyle = '#5a3b1c';
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    switch (this.drawing) {
      case 'sleep':
        // a face with closed eyes, and z z z
        g.beginPath();
        g.arc(x, y, 50, 0, Math.PI * 2);
        g.stroke();
        for (const ex of [-18, 18]) {
          g.beginPath();
          g.arc(x + ex, y - 6, 10, 0.15 * Math.PI, 0.85 * Math.PI);
          g.stroke();
        }
        g.beginPath();
        g.arc(x, y + 22, 9, 0, Math.PI * 2);
        g.stroke();
        g.font = `700 30px ${HAND}`;
        g.fillText('z', x + 52, y - 40);
        g.font = `700 22px ${HAND}`;
        g.fillText('z', x + 76, y - 62);
        break;
      case 'cuckoo':
        // a little bird on a bell tower
        g.beginPath();
        g.moveTo(x - 30, y + 60);
        g.lineTo(x - 30, y - 10);
        g.lineTo(x, y - 40);
        g.lineTo(x + 30, y - 10);
        g.lineTo(x + 30, y + 60);
        g.stroke();
        g.beginPath();
        g.ellipse(x + 8, y - 62, 16, 11, 0, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(x + 22, y - 64);
        g.lineTo(x + 34, y - 60);
        g.stroke();
        break;
      default:
        g.font = `italic 26px ${HAND}`;
        g.fillText('(unfinished)', x - 70, y);
    }
  }

  private wrap(text: string, x: number, y: number, width: number, lineHeight: number): void {
    const g = this.g;
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > width && line) {
        g.fillText(line, x, y);
        y += lineHeight;
        line = word;
      } else line = next;
    }
    if (line) g.fillText(line, x, y);
  }
}

const UP = new Vector3(0, 1, 0);

/**
 * Where a page or scrap rests while it's being read: to the left of where the
 * player is looking, a little below the eyes, facing them. Further away on a
 * flat screen (narrower view) than in VR (arm's reach).
 */
export function readingSpot(world: World, outPosition: Vector3, lookTarget: Vector3, eye = new Vector3(), forward = new Vector3()): void {
  getViewer(world, eye, forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const flat = !world.session;
  forward.applyAxisAngle(UP, ((flat ? 30 : 42) * Math.PI) / 180);
  outPosition.copy(eye).addScaledVector(forward, flat ? 0.6 : 0.4);
  outPosition.y = eye.y - (flat ? 0.16 : 0.24);
  lookTarget.copy(eye);
}
