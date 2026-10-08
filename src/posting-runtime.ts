let start: (() => Promise<void>) | null = null;

export function registerPostingStart(fn: () => Promise<void>): void {
  start = fn;
}

export function requestPostingStart(): Promise<void> {
  return start ? start() : Promise.resolve();
}
