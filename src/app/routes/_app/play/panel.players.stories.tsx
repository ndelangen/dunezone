import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { gameMeta, install, seatPopover } from './game.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Players',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** A spectator of a full game reads that from the header's seat action alone. */
export const FullGameSpectatorSeat = meta.story({
  beforeEach: install(() => productTransport('neutral')),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const seat = await seatPopover(canvasElement, 'You are watching');
    await expect(seat().findByText('All 6 seats are taken')).resolves.toBeVisible();
    await expect(seat().queryByRole('button', { name: /^Request/ })).toBeNull();
    await expect(page.getAllByRole('region', { name: 'You are watching' })).toHaveLength(1);
  },
});

const SLOTS = 'dunezone-compass:slots';

/* Pins the viewer's Faction info bottom right, and puts back what was pinned before once the story ends, so the next story starts as it would have. */
function pinFactionInfo() {
  try {
    const before = localStorage.getItem(SLOTS);
    localStorage.setItem(SLOTS, JSON.stringify({ left: null, right: { key: 'faction-info', seat: 'seat-2' } }));
    return () => (before === null ? localStorage.removeItem(SLOTS) : localStorage.setItem(SLOTS, before));
  } catch {
    /* Without storage the slots start empty. */
    return undefined;
  }
}

/** The Faction info keeps all six tokens on one line, scrolling sideways when its slot is narrow. */
export const FactionTokensScroll = meta.story({
  globals: { viewport: { value: 'table1280' } },
  beforeEach: [install(() => productTransport('seat-2', playingSnapshot('seat-2'))), pinFactionInfo],
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const picker = await within(doc.body).findByRole('group', { name: 'Factions' }, { timeout: 30_000 });
    const tops = new Set([...picker.querySelectorAll('button')].map((button) => button.offsetTop));
    await expect(tops.size, 'The faction tokens wrap onto a second line.').toBe(1);
    await expect(picker.scrollWidth, 'Six tokens outgrow the slot, so the row scrolls.').toBeGreaterThan(
      picker.clientWidth
    );
    /* The rule under the tokens runs from the window's border to its scrolling body's far edge, short only of a scrollbar. */
    const frame = picker.closest('[data-window]')!.getBoundingClientRect();
    const body = picker.parentElement!;
    const scrollbar = body.offsetWidth - body.clientWidth;
    const rule = picker.getBoundingClientRect();
    await expect(Math.abs(rule.left - frame.left), 'The rule stops short of the left edge.').toBeLessThanOrEqual(1.5);
    await expect(
      Math.abs(rule.right + scrollbar - frame.right),
      'The rule stops short of the right edge.'
    ).toBeLessThanOrEqual(1.5);
  },
});
