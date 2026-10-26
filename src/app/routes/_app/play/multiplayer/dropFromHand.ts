/** What a hand piece let go over the private side-table tells it: which piece, and where the pointer was. */
export type SideTableDrop = Readonly<{ pieceId: string; clientX: number; clientY: number }>;

/** The event the private side-table listens for on its own box; it alone turns the point into a spot. */
export const SIDE_TABLE_DROP = 'dune-side-table-drop';

/*
 * A hand piece let go somewhere else on the page: over the table it plays there, through the table's own drop,
 * and over the private side-table it is laid there; each decides where the piece lands.
 */
export function dropFromHand(pieceId: string, clientX: number, clientY: number) {
  const target = document.elementFromPoint(clientX, clientY);
  if (target instanceof HTMLCanvasElement) {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/dune-hand', pieceId);
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer }));
    return;
  }
  const sideTable = target?.closest('[data-side-table]');
  sideTable?.dispatchEvent(new CustomEvent<SideTableDrop>(SIDE_TABLE_DROP, { detail: { pieceId, clientX, clientY } }));
}
