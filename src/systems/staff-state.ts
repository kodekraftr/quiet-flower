/** Shared staff state and commands (keyboard fallback, debug HUD, effects). */

export const staffState = {
  open: false,
  /** Line indices placed on the staff, left to right. */
  melody: [] as number[],
  /** 0.3 while the staff is open (time slows for the world), else 1. */
  timeScale: 1,
};

/** Filled in by StaffSystem.init(). */
export const staffApi = {
  open: (): void => {},
  close: (): void => {},
  toggle: (): void => {},
  appendLine: (_line: number): void => {},
  removeLast: (): void => {},
  cast: (): void => {},
};
