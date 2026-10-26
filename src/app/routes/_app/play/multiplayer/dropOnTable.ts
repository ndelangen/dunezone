/*
 * A hand piece let go over the table plays there, through the table's own drop,
 * so the table alone decides where on its plate the piece lands.
 */
export function dropOnTable(pieceId: string, clientX: number, clientY: number) {
  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof HTMLCanvasElement)) {
    return;
  }
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('application/dune-hand', pieceId);
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer }));
}
