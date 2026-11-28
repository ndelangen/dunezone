import type { Side } from './slotLimits';

/** One of a slot's one-off animations (a flash, a bounce), by side; `at` grows so asking again replays it. */
export type Pulse = { side: Side; at: number } | null;

export function pulse(side: Side) {
  return (current: Pulse): Pulse => ({ side, at: (current?.at ?? 0) + 1 });
}

/** The pulse as a slot's data attribute alternates it, 0 or 1, so each replay is a change; nothing for the other side. */
export function pulseOf(current: Pulse, side: Side | 'centre') {
  return current?.side === side ? current.at % 2 : undefined;
}
