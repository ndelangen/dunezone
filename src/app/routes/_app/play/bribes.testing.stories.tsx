import { testingPreview } from '@sb/preview';
import { factionTokenOf } from '@shared/play/factionToken';
import { stackTopHeight } from '@shared/play/tableGeometry';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { carryOnto, giftPoints, looseSpiceSnapshot } from './bribes.stories.fixture';
import { gameMeta, install, session } from './game.stories.fixture';
import { tablePage } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Bribes',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const drops = () => session.transport.messages.filter((message) => message.type === 'drop');

async function giftRing(canvasElement: HTMLElement) {
  const { document, page } = await tablePage(canvasElement);
  const { spice, token } = giftPoints(looseSpiceSnapshot());
  await carryOnto(document, spice, token);
  const ring = await waitFor(() => page.getByRole('menu', { name: /^Give 1 spice to / }), { timeout: 30_000 });
  return { page, ring };
}

/* Picking an item of the ring lets the spice go over the token as that gift, the one drop the carry sends, and closes the ring. */
const picks = (item: RegExp, give: 'bribe' | 'payment') => ({
  beforeEach: install(() => productTransport('seat-2', looseSpiceSnapshot())),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const { page, ring } = await giftRing(canvasElement);
    await expect(drops()).toEqual([]);
    await userEvent.click(within(ring).getByRole('menuitem', { name: item }));
    await waitFor(() =>
      expect(drops()).toEqual([expect.objectContaining({ give: { as: give, factionId: 'emperor' } })])
    );
    await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
  },
});

/** Picking Bribe lets the spice go over the token as a bribe. */
export const BribeSendsTheDrop = meta.story(picks(/^Bribe /, 'bribe'));

/** Picking Payment lets the spice go over the token as a payment. */
export const PaymentSendsTheDrop = meta.story(picks(/^Pay /, 'payment'));

/** Escape closes the ring and puts the spice back where it came from: the carry is cancelled and nothing is dropped. */
export const EscapePutsTheSpiceBack = meta.story({
  beforeEach: install(() => productTransport('seat-2', looseSpiceSnapshot())),
  play: async ({ canvasElement }) => {
    const { page } = await giftRing(canvasElement);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(session.transport.messages.some((message) => message.type === 'cancel')).toBe(true));
    await expect(drops()).toEqual([]);
  },
});

/** Spice let go over the viewer's own faction token lands as any drop does, with no ring. */
export const OwnTokenAsksNothing = meta.story({
  beforeEach: install(() => productTransport('seat-2', looseSpiceSnapshot())),
  play: async ({ canvasElement }) => {
    const { document, page } = await tablePage(canvasElement);
    const snapshot = looseSpiceSnapshot();
    const own = snapshot.roster!.seats.find((seat) => seat.id === 'seat-2')!.faction!.id;
    const token = factionTokenOf(snapshot.table.pieces, own)!;
    await carryOnto(document, giftPoints(snapshot).spice, [
      token.position[0],
      token.position[1] + stackTopHeight(token),
      token.position[2],
    ]);
    await waitFor(() => expect(drops()).toHaveLength(1));
    await expect(drops()[0]).not.toHaveProperty('give');
    await expect(page.queryByRole('menu')).toBeNull();
  },
});
