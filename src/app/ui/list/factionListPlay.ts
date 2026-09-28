import { expect, waitFor, within } from 'storybook/test';

/**
 * Reads the column count of the faction list inside `scope`, and checks that a card is as wide as its column, since the card sets no width of its own.
 *
 * The list's own stories pass their canvas.
 * A page story passes the part of the page that holds the list, so it can hold the count to the list's width where that differs from the window's.
 */
export async function expectFactionColumns(scope: HTMLElement, count: number) {
  const [card] = await within(scope).findAllByRole('link', {}, { timeout: 30_000 });
  await waitFor(() => {
    let grid = card.parentElement;
    while (grid && getComputedStyle(grid).display !== 'grid') {
      grid = grid.parentElement;
    }
    const tracks = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ') : [];
    expect(tracks).toHaveLength(count);
    expect(card.getBoundingClientRect().width).toBeCloseTo(Number.parseFloat(tracks[0]), 0);
  });
}
