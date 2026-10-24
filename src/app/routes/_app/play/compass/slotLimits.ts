/*
 * How tall a pinned slot may be. A slot grows upward from the table's bottom edge and must never cover the chrome
 * drawn over the table: the header chips (phase, alliances, next phase) and the camera dial.
 */

export type Side = 'left' | 'right';

export const SIDES = ['left', 'right'] as const;

export const MIN_SLOT_HEIGHT = 120;
/* How far one arrow key press on a slot's grip resizes it. */
export const RESIZE_STEP = 24;
/* Breathing room kept between a slot's top edge and the overlay above it. */
export const OVERLAY_GAP = 12;
/* The overlays a slot must never cover. */
export const OVERLAYS = '.seated-header, .seated-column-camera, [data-overlay]';

/*
 * Whether a part of an overlay is drawn above a slot's columns. Full-width containers are layout, not something drawn;
 * the visible chips inside them count.
 */
function coversSlot(part: HTMLElement, box: DOMRect, rootWidth: number) {
  const rect = part.getBoundingClientRect();
  const drawn = rect.width > 0 && rect.height > 0 && rect.width <= rootWidth * 0.6;
  const above = rect.right > box.left && rect.left < box.right && rect.top < box.bottom - MIN_SLOT_HEIGHT;
  if (!drawn || !above) {
    return false;
  }
  const style = getComputedStyle(part);
  return style.visibility !== 'hidden' && style.opacity !== '0';
}

/** How tall a slot may be: from its bottom up to the lowest visible overlay part that shares its columns. */
export function slotLimit(root: HTMLElement, slot: HTMLElement) {
  const box = slot.getBoundingClientRect();
  let ceiling = root.getBoundingClientRect().top;
  for (const overlay of root.querySelectorAll<HTMLElement>(OVERLAYS)) {
    for (const part of [overlay, ...overlay.querySelectorAll<HTMLElement>('*')]) {
      if (coversSlot(part, box, root.clientWidth)) {
        ceiling = Math.max(ceiling, part.getBoundingClientRect().bottom);
      }
    }
  }
  return Math.max(MIN_SLOT_HEIGHT, Math.floor(box.bottom - ceiling - OVERLAY_GAP));
}

/** The height a slot takes when asked for one: never under the minimum, never over its limit, which it bounces off. */
export function fitHeight(wanted: number, limit: number) {
  return { height: Math.round(Math.max(MIN_SLOT_HEIGHT, Math.min(limit, wanted))), bounced: wanted > limit };
}
