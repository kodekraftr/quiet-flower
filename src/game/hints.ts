/**
 * "Stuck for 45 seconds → new handwriting appears on the current scrap"
 * (storyboard, failure rules). Pure module: the caller supplies the time.
 */

export const HINT_DELAY_MS = 45_000;

export class HintClock {
  private text: string | null = null;
  private since = 0;
  private shown = false;

  constructor(private readonly delayMs = HINT_DELAY_MS) {}

  /** The hint for the current step; restarts the wait. */
  set(text: string | null, nowMs: number): void {
    this.text = text;
    this.since = nowMs;
    this.shown = false;
  }

  /** The player did something useful: restart the wait without changing the hint. */
  poke(nowMs: number): void {
    if (!this.shown) this.since = nowMs;
  }

  /** Returns the hint once, when it becomes due. */
  due(nowMs: number): string | null {
    if (!this.text || this.shown || nowMs - this.since < this.delayMs) return null;
    this.shown = true;
    return this.text;
  }
}
