/* A mouse drag as the browser sends it: pressed on one piece, moved in small steps onto the first half of another, and let go there. */
export async function dragOnto(source: HTMLElement, target: HTMLElement, held: () => void = () => {}) {
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  const end = { x: to.left + to.width / 4, y: to.top + to.height / 2 };
  const pointer = (type: string, x: number, y: number, on: EventTarget) =>
    on.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        pointerId: 1,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
      })
    );
  pointer('pointerdown', start.x, start.y, source);
  for (let step = 1; step <= 12; step++) {
    pointer(
      'pointermove',
      start.x + ((end.x - start.x) * step) / 12,
      start.y + ((end.y - start.y) * step) / 12,
      source.ownerDocument
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  held();
  pointer('pointerup', end.x, end.y, source.ownerDocument);
}
