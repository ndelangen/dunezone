/** The chosen reserve amount and screen point, answered by the canvas that owns table geometry. */
export type SpiceReserveDrop = {
  readonly amount: number;
  readonly clientX: number;
  readonly clientY: number;
  commandId?: string;
};

export const SPICE_RESERVE_PICKUP = 'dune-spice-reserve-pickup';

/** Starts a visible keyboard placement without sending a command. */
export function pickUpSpiceFromReserve(amount: number): void {
  document
    .querySelector('.dune-play-shell canvas[data-play-camera="ready"]')
    ?.dispatchEvent(new CustomEvent(SPICE_RESERVE_PICKUP, { detail: { amount } }));
}

export const SPICE_RESERVE_DROP = 'dune-spice-reserve-drop';

/** A cancelled drag or a drop outside the table leaves the reserve unchanged. */
export function dropSpiceFromReserve(amount: number, point: Readonly<{ x: number; y: number }>): boolean {
  const target = document.elementFromPoint(point.x, point.y);
  if (!(target instanceof HTMLCanvasElement)) {
    return false;
  }
  const detail: SpiceReserveDrop = { amount, clientX: point.x, clientY: point.y };
  target.dispatchEvent(new CustomEvent<SpiceReserveDrop>(SPICE_RESERVE_DROP, { detail }));
  return Boolean(detail.commandId);
}
