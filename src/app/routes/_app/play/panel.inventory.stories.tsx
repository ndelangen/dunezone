import preview from '@sb/preview';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
import { SPAWN_PICKER_STEP } from '@shared/play/inventory';
import { item, piece } from '@shared/play/setupSupply';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { asset, db } from '@db/storybook';

import { windowNamed } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { openTab, pendingRequestTransport, phaseControls, settled } from './playing.stories.fixture';
import {
  cardBack,
  factions,
  productGameDatabase,
  productTransport,
  playingSnapshot as initialSnapshot,
  SIX,
} from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Shared table inventory',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const drawerFactions = factions.slice(3);

export const Requests = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(pendingRequestTransport),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared table inventory');
    await expect(page.findByRole('button', { name: 'Approve' }, { timeout: 30_000 })).resolves.toBeEnabled();
    await expect(page.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Drag House Atreides tokens onto the table' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Approve' }));
    await expect(lastCommand()?.action).toEqual({
      kind: 'spawn-approve',
      requestId: 'pending-token',
    });
    await userEvent.click(page.getByRole('button', { name: 'Dismiss' }));
    await expect(lastCommand()?.action).toEqual({
      kind: 'spawn-dismiss',
      requestId: 'pending-token',
    });
    const initial = initialSnapshot();
    session.transport.deliver(
      session.transport.view({
        ...initial,
        revision: 1,
        controls: {
          ...initialSnapshot().controls!,
          seats: SIX.map((player) => player.seat),
          requests: [
            {
              id: 'own-request',
              requesterSeat: 'seat-2',
              requesterName: 'Thialfi',
              contents: {
                assetId: 'recovery',
                name: 'House Atreides token',
                type: 'token-disc',
                members: [{ assetId: 'recovery', count: 1 }],
                definitions: [],
                pieces: [initial.table.pieces[0]],
              },
            },
          ],
        },
      })
    );
    await waitFor(() => expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled());
    await expect(page.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  },
});

/** In a narrow content column the panel keeps its functional text (request labels, readiness and status), while its help lives in the tab's tooltip. */
export const Narrow = meta.story({
  globals: { viewport: { value: 'contentColumn' } },
  beforeEach: install(pendingRequestTransport),
  play: async ({ canvasElement }) => {
    const { page, waitForPhase } = phaseControls(canvasElement);
    await openTab(page, 'Shared table inventory');
    await waitForPhase(async () => {
      await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
      await expect(page.getByText('House Atreides tokens requested by Twaffle')).toBeVisible();
    });
    /* The kit's HelpMark story owns timed tooltip display; this page checks that each window's (?) carries its description and help. */
    await expect(
      within(windowNamed(page, 'Shared table inventory')!).getByRole('img', { name: 'Help' })
    ).toHaveAccessibleDescription('Pieces every player can take. Drag an item onto the table. It lands face down.');
    await openTab(page, 'Phase');
    await expect(within(windowNamed(page, 'Phase')!).getByRole('img', { name: 'Help' })).toHaveAccessibleDescription(
      'Storm, instructions and actions. Move the storm using the storm controls. Previous moves the tracker back. Pieces and storm stay put.'
    );
  },
});

/** A drawer of catalogue pieces, cards and tokens, whose thumbnails arrive through `PublishedImage` at their own shapes. */
export const Arrival = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() => {
    const snapshot = initialSnapshot();
    const tokens = drawerFactions.map(({ slug, data, token }) => {
      const href = new URL(token, location.origin).href;
      return {
        ...piece(`inventory-${slug}`, `${data.name} tokens`, 'shared', data.themeColor, 'force', `token:${slug}`),
        inventory: 'shared' as const,
        items: [0, 1, 2].map((index) =>
          item(`inventory-${slug}-${index}`, `${data.name} token`, href, href, 'token-disc', true)
        ),
      };
    });
    snapshot.table.pieces = [
      ...snapshot.table.pieces.map((entry) =>
        entry.id === 'treachery-deck' ? { ...entry, inventory: 'shared' as const } : entry
      ),
      ...tokens,
    ];
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared table inventory');
    await settled(async () => {
      /* A stack is dragged by its label; a token's image is named for the token itself, as its tooltip names it. */
      const thumbnails = [
        { label: 'Treachery deck', image: 'Treachery deck' },
        ...drawerFactions.map(({ data }) => ({ label: `${data.name} tokens`, image: `${data.name} token` })),
      ];
      for (const { label, image } of thumbnails) {
        const thumbnail = page.getByRole('button', { name: `Drag ${label} onto the table` });
        await expect(thumbnail).toBeEnabled();
        await expect(within(thumbnail).getByRole('img', { name: image }).closest('[data-phase]')).toHaveAttribute(
          'data-phase',
          'shown'
        );
      }
    });
  },
});

export const HiddenDeckBacks = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() => {
    const snapshot = initialSnapshot();
    const card = {
      ...snapshot.table.pieces.find((piece) => piece.kind === 'card')!,
      id: 'hidden-inventory-deck',
      label: 'Treachery deck',
      inventory: 'shared' as const,
      /* The key a catalogue spawn carries, not the one the backless placeholder cards share. */
      stackKey: 'deck:dreamrules-treachery-deck',
      items: [
        {
          id: 'opaque-card',
          faceUp: false,
          artwork: { back: cardBack(), backName: 'Treachery' },
        },
      ],
    };
    snapshot.table.pieces.push(card, {
      ...card,
      id: 'hidden-board-card',
      inventory: undefined,
      position: [0, 0.38, 0],
    });
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared table inventory');
    await waitFor(
      () => expect(page.getByRole('button', { name: 'Drag Treachery deck onto the table' })).toBeVisible(),
      {
        timeout: 30_000,
      }
    );
    await expect(page.getByRole('img', { name: 'Treachery deck' })).toHaveAttribute('src', cardBack());
    await expect(page.getByRole('button', { name: 'Drag Treachery deck onto the table' })).toBeEnabled();
  },
});

/* The baseline holds six spawnable assets; these take the catalogue past the picker's first page, so Load more has something to load. */
const EXTRA_TOKENS = 14;
/* How many disc tokens the catalogue holds, the seeded ones and the product's own; the database counts them as it builds. */
let discTokens = 0;
const catalogueDatabase = db((baseline) => {
  productGameDatabase(baseline, { state: 'ready' });
  for (let index = 1; index <= EXTRA_TOKENS; index += 1) {
    baseline.assets.push(
      asset({
        type: 'token-disc',
        data: {
          name: `Sietch Token ${String(index).padStart(2, '0')}`,
          about: 'A disc token seeded for the spawn picker story.',
          front: publishingTokenFace,
          back: { mode: 'same' },
        },
      })
    );
  }
  discTokens = baseline.assets.filter((entry) => entry.type === 'token-disc' && !entry.is_deleted).length;
});

/**
 * The Disc tokens shelf's catalogue picker: the newest disc tokens a page at a time and no other type, a server search over the asset's and its owner's name, and a keyboard pick that asks the table to check the asset before it can be requested.
 * The story's transport answers no catalogue read, so the check stays pending, as it does while the Worker reads the definitions.
 */
export const Catalogue = meta.story({
  parameters: { chromatic: { disableSnapshot: true }, database: catalogueDatabase },
  beforeEach: install(() => productTransport('seat-2', initialSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared table inventory');
    await userEvent.click(
      await page.findByRole('button', { name: 'Add disc tokens from the catalogue' }, { timeout: 30_000 })
    );
    const options = () => within(page.getByRole('listbox', { name: 'Catalogue assets' })).getAllByRole('option');
    /* The row Enter would pick: Mantine marks it on the row itself, since the rows are inline rather than in a dropdown of their own. */
    const highlighted = () => options().findIndex((option) => option.hasAttribute('data-combobox-selected'));
    const picks = () => session.transport.messages.filter((message) => message.type === 'catalogue');
    const search = page.getByRole('searchbox', { name: 'Search the catalogue' });
    await waitFor(() => expect(options()).toHaveLength(SPAWN_PICKER_STEP), { timeout: 30_000 });
    await waitFor(() => expect(highlighted()).toBe(0));
    /* Load more grows the list under the reader's highlight, so a keyboard reader keeps their place in it. */
    await userEvent.click(search);
    await userEvent.keyboard('{ArrowDown}');
    await expect(highlighted()).toBe(1);
    await userEvent.click(page.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(options()).toHaveLength(discTokens), { timeout: 30_000 });
    await expect(page.queryByRole('button', { name: 'Load more' })).toBeNull();
    await expect(highlighted()).toBe(1);
    /*
     * Escape has no dropdown to close here, so the rows stay pickable afterwards.
     * Enter before the typed word settles picks nothing, since the rows still answer the search before it.
     */
    await userEvent.click(search);
    await userEvent.keyboard('{Escape}t{Enter}');
    await expect(picks()).toHaveLength(0);
    /* The shelf's search finds none of the other types: the House Treachery deck is on the Decks shelf's. */
    await userEvent.keyboard('reachery');
    await expect(page.findByText('No deck, bundle or token matches.', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, 'Sietch Token 03');
    await waitFor(() => expect(options()).toHaveLength(1), { timeout: 30_000 });
    await expect(options()[0]).toHaveTextContent('Sietch Token 03');
    /* The best match is highlighted as soon as it lists, so Enter from the search box picks it without an arrow key first. */
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(picks()).toEqual([
        expect.objectContaining({ type: 'catalogue', selection: { type: 'token-disc', slug: 'sietch-token-03' } }),
      ])
    );
    await expect(page.getByText('Checking published definitions and images...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request' })).toBeDisabled();
  },
});
