/* The seated play shell's header around a table element, which lies over the canvas's top; none outside a seated table. */
export function seatedHeaderOf(element: Element): HTMLElement | null {
  return element.closest('.dune-play-shell')?.querySelector<HTMLElement>('.seated-header') ?? null;
}
