export type VisibilityState = 'event' | 'always_up' | 'never_up';
type VisibilityChange = { state: 'event'; timestamp: number; initiallyUp: boolean }
  | { state: 'always_up' | 'never_up'; timestamp: null; initiallyUp: boolean };

/** First visibility change in a finite window. A missing event is a state, never a countdown. */
export function findVisibilityChange(
  visible: (timestamp: number) => boolean,
  start: number,
  end: number,
  stepMs = 30 * 60_000
): VisibilityChange {
  const initiallyUp = visible(start);
  let previous = start;
  for (let time = Math.min(start + stepMs, end); time <= end; time = Math.min(time + stepMs, end)) {
    if (visible(time) !== initiallyUp) {
      return { state: 'event', timestamp: bisectVisibility(visible, previous, time), initiallyUp };
    }
    if (time === end) break;
    previous = time;
  }
  return { state: initiallyUp ? 'always_up' : 'never_up', timestamp: null, initiallyUp };
}

/** Bracket a visibility transition to at most one minute. */
export function bisectVisibility(visible: (timestamp: number) => boolean, low: number, high: number): number {
  const before = visible(low);
  while (high - low > 60_000) {
    const middle = (low + high) / 2;
    if (visible(middle) === before) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
