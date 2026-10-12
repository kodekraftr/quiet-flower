/**
 * A guard's state (storyboard Scene 3/4, build spec GuardSystem). Pure module:
 * the scene feeds it story time (already slowed while the staff is open) and
 * acts on the events it returns.
 *
 *   idle ──alert(s)──▶ alert ──(s elapse)──▶ checking  (scene walks them over;
 *                                                       arriving = caught)
 *   any ──sleep(s)──▶ asleep ──(s elapse)──▶ woke       (scene decides: caught)
 *
 * `idle` covers a guard busy with something else (dozing at a table, playing
 * dice): they don't notice the player.
 */

export type GuardState = 'idle' | 'alert' | 'checking' | 'asleep' | 'awake' | 'lured';
export type GuardEvent = 'go-check' | 'woke' | null;

export const SLEEP_SECONDS = 30;

export class GuardBrain {
  state: GuardState = 'idle';
  /** Seconds left in the current timed state (alert or asleep). */
  timer = 0;

  /** Something odd happened; they'll go and check after `seconds` unless asleep first. */
  alert(seconds: number): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'alert';
    this.timer = seconds;
    return true;
  }

  /** Sleep reached them. Returns false if they were already asleep. */
  sleep(seconds = SLEEP_SECONDS): boolean {
    const wasAsleep = this.state === 'asleep';
    this.state = 'asleep';
    this.timer = seconds;
    return !wasAsleep;
  }

  /** Lured away (Cuckoo): out of the way until the scene says otherwise. */
  lure(): void {
    if (this.state !== 'asleep') this.state = 'lured';
  }

  get asleep(): boolean {
    return this.state === 'asleep';
  }

  /** Can this guard see the player right now? */
  get watching(): boolean {
    return this.state === 'awake' || this.state === 'checking';
  }

  update(dt: number): GuardEvent {
    if (this.state !== 'alert' && this.state !== 'asleep') return null;
    this.timer -= dt;
    if (this.timer > 0) return null;
    if (this.state === 'alert') {
      this.state = 'checking';
      return 'go-check';
    }
    this.state = 'awake';
    return 'woke';
  }

  reset(): void {
    this.state = 'idle';
    this.timer = 0;
  }
}
