/**
 * The player's own song, written on one sheet of paper (storyboard Scene 2):
 * drawn on a canvas and cut into the 5 torn pieces from src/game/scraps.ts.
 *
 * The page carries the melody (the Rise notes in colour, matching the staff
 * lines), and its margins later show the past self's drawings that teach the
 * clap and the fist, plus handwritten hints. Nothing is a pop-up: it is all
 * on the paper.
 */

import {
  CanvasTexture,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { LINE_COLOR_CSS, noteName, type Notation } from '../game/notes.js';
import { piecePolygons, polygonCentroid } from '../game/scraps.js';

/** Page size in metres. */
export const PAGE_W = 0.34;
export const PAGE_H = 0.23;
const PX_W = 1024;
const PX_H = Math.round((PX_W * PAGE_H) / PAGE_W);

const INK = '#3a2d1e';
const FADED = 'rgba(58,45,30,0.45)';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

/** The rest of the garden song, in plain ink: the guards kept its spells. */
const SONG_A = [2, 3, 2, 1, 0, 1, 2, 2, 3, 1];
const SONG_B = [0, 1, 2];
/** The restored spell fragment: Ga Ma (Rise). */
const RISE = [2, 3];

export interface SheetMargins {
  clap: boolean;
  fist: boolean;
  hint: string | null;
  /** 0–1: how brightly the spell notes glow. */
  glow: number;
}

export class SongSheet {
  /** Page space: origin at the page centre, x right, y up, +z toward the reader. */
  readonly group = new Group();
  readonly pieces: Mesh[] = [];
  /** Each piece's home position in page space (its centroid). */
  readonly homes: Vector3[] = [];
  /** Faint outline of where the page goes. */
  readonly outline: LineLoop;
  readonly margins: SheetMargins = { clap: false, fist: false, hint: null, glow: 0 };
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private drawnKey = '';

  constructor(private notation: Notation) {
    this.canvas.width = PX_W;
    this.canvas.height = PX_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: this.texture, side: DoubleSide, toneMapped: false });

    for (const poly of piecePolygons()) {
      const [cu, cv] = polygonCentroid(poly);
      const home = new Vector3((cu - 0.5) * PAGE_W, (cv - 0.5) * PAGE_H, 0);
      const shape = new Shape();
      poly.forEach(([u, v], i) => {
        const x = (u - 0.5) * PAGE_W - home.x;
        const y = (v - 0.5) * PAGE_H - home.y;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      const geo = new ShapeGeometry(shape);
      // Map each vertex back onto the full sheet so every piece shows its own part.
      const pos = geo.getAttribute('position');
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (pos.getX(i) + home.x) / PAGE_W + 0.5, (pos.getY(i) + home.y) / PAGE_H + 0.5);
      }
      const mesh = new Mesh(geo, material);
      mesh.position.copy(home);
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.pieces.push(mesh);
      this.homes.push(home);
    }

    const w = PAGE_W / 2 + 0.006;
    const h = PAGE_H / 2 + 0.006;
    const outlineGeo = new BufferGeometry();
    outlineGeo.setAttribute('position', new Float32BufferAttribute([-w, -h, -0.002, w, -h, -0.002, w, h, -0.002, -w, h, -0.002], 3));
    this.outline = new LineLoop(outlineGeo, new LineBasicMaterial({ color: 0xf3e6c4, transparent: true, opacity: 0.35 }));
    this.group.add(this.outline);
    this.redraw();
  }

  setNotation(n: Notation): void {
    this.notation = n;
    this.redraw();
  }

  /** Redraws the page if anything visible changed (cheap to call often). */
  redraw(): void {
    const m = this.margins;
    const key = `${this.notation}|${m.clap}|${m.fist}|${m.hint}|${Math.round(m.glow * 10)}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const g = this.ctx;
    this.paper(g);

    g.fillStyle = INK;
    g.font = `italic 600 46px ${HAND}`;
    g.fillText('Quiet Flower', 60, 72);
    g.font = `26px ${HAND}`;
    g.fillStyle = FADED;
    g.fillText('— for the garden, hummed slow', 330, 72);

    this.staff(g, 120, 185, 700);
    this.notes(g, SONG_A, 200, 185, 50, INK);
    this.staff(g, 120, 330, 700);
    this.notes(g, SONG_B, 200, 330, 50, FADED);

    // The spell fragment: coloured note heads, bracketed, named underneath.
    const x0 = 430;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x0 - 30, 236);
    g.lineTo(x0 - 30, 226);
    g.lineTo(x0 + 140, 226);
    g.lineTo(x0 + 140, 236);
    g.stroke();
    RISE.forEach((line, i) => {
      const x = x0 + i * 90;
      const y = this.noteY(330, line);
      if (m.glow > 0) {
        g.save();
        g.shadowColor = LINE_COLOR_CSS[line];
        g.shadowBlur = 10 + m.glow * 40;
        g.fillStyle = LINE_COLOR_CSS[line];
        g.globalAlpha = 0.5 + m.glow * 0.5;
        g.beginPath();
        g.ellipse(x, y, 26, 19, -0.35, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      this.head(g, x, y, LINE_COLOR_CSS[line], 1.25);
      g.fillStyle = INK;
      g.font = `600 30px ${HAND}`;
      g.textAlign = 'center';
      g.fillText(noteName(line, this.notation), x, 440);
      g.textAlign = 'left';
    });

    if (m.clap) this.drawClap(g, 780, 110);
    if (m.fist) this.drawFist(g, 860, 470);

    if (m.hint) {
      g.fillStyle = '#5a3b1c';
      g.font = `italic 30px ${HAND}`;
      this.wrap(g, m.hint, 60, 530, 640, 38);
    }
    this.texture.needsUpdate = true;
  }

  private paper(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#e8dbbd';
    g.fillRect(0, 0, PX_W, PX_H);
    // age stains and darkened edges (fixed positions: the same page every time)
    const stains: [number, number, number, number][] = [
      [180, 560, 140, 0.1],
      [860, 140, 110, 0.08],
      [640, 420, 200, 0.06],
      [90, 120, 90, 0.07],
    ];
    for (const [x, y, r, a] of stains) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(120,80,30,${a})`);
      grad.addColorStop(1, 'rgba(120,80,30,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const edge = g.createRadialGradient(PX_W / 2, PX_H / 2, PX_H * 0.45, PX_W / 2, PX_H / 2, PX_W * 0.62);
    edge.addColorStop(0, 'rgba(90,60,25,0)');
    edge.addColorStop(1, 'rgba(90,60,25,0.32)');
    g.fillStyle = edge;
    g.fillRect(0, 0, PX_W, PX_H);
  }

  /** Five ink lines with a simple clef mark; `y` is the bottom line. */
  private staff(g: CanvasRenderingContext2D, x: number, y: number, x1: number): void {
    g.strokeStyle = INK;
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(x - 60, y - i * 18 + Math.sin(i * 1.3) * 1.5);
      g.lineTo(x1, y - i * 18 - Math.sin(i * 0.7) * 1.5);
      g.stroke();
    }
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 40, y + 14);
    g.bezierCurveTo(x - 20, y - 20, x - 62, y - 50, x - 38, y - 84);
    g.bezierCurveTo(x - 28, y - 60, x - 60, y - 30, x - 46, y - 10);
    g.bezierCurveTo(x - 30, y + 6, x - 18, y - 30, x - 40, y - 34);
    g.stroke();
  }

  /** Staff line 0 (Sa) sits a step below the bottom line; each line index is one step up. */
  private noteY(staffBottom: number, line: number): number {
    return staffBottom + 9 - line * 9;
  }

  private notes(g: CanvasRenderingContext2D, lines: readonly number[], x0: number, y: number, dx: number, color: string): void {
    lines.forEach((line, i) => this.head(g, x0 + i * dx, this.noteY(y, line), color, 1));
  }

  private head(g: CanvasRenderingContext2D, x: number, y: number, color: string, scale: number): void {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, 11 * scale, 8 * scale, -0.35, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = color === FADED ? FADED : INK;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x + 10 * scale, y - 2);
    g.lineTo(x + 10 * scale, y - 52 * scale);
    g.stroke();
  }

  /** Two hands meeting, then arrows pulling them apart. */
  private drawClap(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.strokeStyle = '#5a3b1c';
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    const hand = (cx: number, flip: number): void => {
      g.beginPath();
      g.ellipse(cx, y + 90, 26, 44, flip * 0.15, 0, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(cx - 18 + k * 12, y + 50);
        g.lineTo(cx - 20 + k * 12 + flip * 2, y + 14 + Math.abs(k - 1.5) * 6);
        g.stroke();
      }
    };
    hand(x + 40, -1);
    hand(x + 100, 1);
    g.beginPath();
    g.moveTo(x + 60, y + 180);
    g.lineTo(x - 10, y + 180);
    g.moveTo(x + 6, y + 168);
    g.lineTo(x - 10, y + 180);
    g.lineTo(x + 6, y + 192);
    g.moveTo(x + 80, y + 180);
    g.lineTo(x + 150, y + 180);
    g.moveTo(x + 134, y + 168);
    g.lineTo(x + 150, y + 180);
    g.lineTo(x + 134, y + 192);
    g.stroke();
    g.fillStyle = '#5a3b1c';
    g.font = `italic 26px ${HAND}`;
    g.textAlign = 'center';
    g.fillText('clap… then apart', x + 70, y + 232);
    g.textAlign = 'left';
  }

  /** A closed fist inside a ring of dots. */
  private drawFist(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.strokeStyle = '#5a3b1c';
    g.lineWidth = 3.5;
    g.beginPath();
    g.roundRect(x - 34, y - 30, 68, 58, 18);
    g.stroke();
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(x - 24 + k * 16, y - 30, 8, Math.PI, 0);
      g.stroke();
    }
    g.fillStyle = '#b8892f';
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      g.beginPath();
      g.arc(x + Math.cos(a) * 64, y + Math.sin(a) * 64, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#5a3b1c';
    g.font = `italic 26px ${HAND}`;
    g.textAlign = 'center';
    g.fillText('hold a fist to sing', x, y + 104);
    g.textAlign = 'left';
  }

  private wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number): void {
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > width && line) {
        g.fillText(line, x, y);
        y += lineHeight;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) g.fillText(line, x, y);
  }
}
