import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

export interface TextStyle {
  /** CSS font, size in canvas pixels. */
  font?: string;
  color?: string;
  background?: string | null;
  align?: CanvasTextAlign;
}

/**
 * A text label drawn to a canvas texture on a plane. Redraws only when the
 * text changes, so it is cheap to call `set()` every frame.
 */
export class CanvasText {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private current = '';
  private currentColor = '';

  constructor(
    widthM: number,
    heightM: number,
    pxWidth = 512,
    pxHeight = 128,
    private readonly style: TextStyle = {},
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxWidth;
    this.canvas.height = pxHeight;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), material);
    this.mesh.renderOrder = 10;
  }

  set(text: string, color?: string): void {
    const c = color ?? this.style.color ?? '#E8EEF5';
    if (text === this.current && c === this.currentColor) return;
    this.current = text;
    this.currentColor = c;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.style.background) {
      ctx.fillStyle = this.style.background;
      const r = canvas.height * 0.25;
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, r);
      ctx.fill();
    }
    const lines = text.split('\n');
    const size = Math.floor((canvas.height * 0.62) / Math.max(1, lines.length));
    ctx.font = this.style.font ?? `600 ${size}px system-ui, "Segoe UI", sans-serif`;
    ctx.fillStyle = c;
    ctx.textAlign = this.style.align ?? 'center';
    ctx.textBaseline = 'middle';
    const x = ctx.textAlign === 'left' ? canvas.height * 0.2 : canvas.width / 2;
    const step = canvas.height / lines.length;
    lines.forEach((line, i) => ctx.fillText(line, x, step * (i + 0.5), canvas.width * 0.96));
    this.texture.needsUpdate = true;
  }

  setOpacity(opacity: number): void {
    this.mesh.material.opacity = opacity;
    this.mesh.visible = opacity > 0.01;
  }
}
