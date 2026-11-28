/**
 * What a hand piece let go over the private side-table tells it: which piece, and where the pointer was.
 * The side-table answers with the command that lays it, so the hand can let the piece go until the room answers.
 */
export type SideTableDrop = {
  readonly pieceId: string;
  readonly clientX: number;
  readonly clientY: number;
  commandId?: string;
};

/** Where a dropped hand piece went, and for the side-table the command that takes it there. */
export type HandDrop = Readonly<{ where: 'table' } | { where: 'side'; commandId: string }>;

/** The event the private side-table listens for on its own box; it alone turns the point into a spot. */
export const SIDE_TABLE_DROP = 'dune-side-table-drop';

/*
 * A hand piece let go somewhere else on the page: over the table it plays there, through the table's own drop,
 * and over the private side-table it is laid there; each decides where the piece lands.
 */
export function dropFromHand(pieceId: string, clientX: number, clientY: number): HandDrop | undefined {
  const target = document.elementFromPoint(clientX, clientY);
  if (target instanceof HTMLCanvasElement) {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/dune-hand', pieceId);
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer }));
    return { where: 'table' };
  }
  const detail: SideTableDrop = { pieceId, clientX, clientY };
  target?.closest('[data-side-table]')?.dispatchEvent(new CustomEvent<SideTableDrop>(SIDE_TABLE_DROP, { detail }));
  return detail.commandId ? { where: 'side', commandId: detail.commandId } : undefined;
}
