/*
 * How a revealed spice card offers to place its spice (#2678), while the options are compared on the Mac:
 * on the card's ring, as a button on the lit territory, as a button beside the card, or by itself when the player turns it face up.
 * Stories pick one; the page keeps the ring until one is chosen and the others go.
 */
export type SpiceBlowTrigger = 'ring' | 'territory' | 'card' | 'auto';

let current: SpiceBlowTrigger = 'ring';

export function spiceBlowTrigger(): SpiceBlowTrigger {
  return current;
}

export function setSpiceBlowTrigger(trigger: SpiceBlowTrigger) {
  current = trigger;
}
