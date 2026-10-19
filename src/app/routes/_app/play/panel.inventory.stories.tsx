import preview from '@sb/preview';
import { item, piece } from '@shared/play/setupSupply';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { openTab, pendingRequestTransport, phaseControls, settled } from './playing.stories.fixture';
import {
  cardBack,
  factions,
  productTransport,
  playingSnapshot as initialSnapshot,
  SIX,
} from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Shared inventory',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const drawerFactions = factions.slice(3);

export const Requests = meta.story({
  beforeEach: install(pendingRequestTransport),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared inventory');
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
    await openTab(page, 'Shared inventory');
    await waitForPhase(async () => {
      await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
      await expect(page.getByText('House Atreides tokens requested by Twaffle')).toBeVisible();
    });
    /* The kit's TabGuidance story owns timed tooltip display; this page checks that each tab receives its description and help. */
    await expect(page.getByRole('tab', { name: 'Shared inventory' })).toHaveAccessibleDescription(
      'Pieces every player can take. Drag an item onto the table. It lands face down.'
    );
    await openTab(page, 'Phase');
    await expect(page.getByRole('tab', { name: 'Phase' })).toHaveAccessibleDescription(
      'Storm, instructions and actions. Move the storm using the storm controls. Previous changes the tracker only. Pieces and storm position stay as they are.'
    );
  },
});

/** A drawer of catalogue pieces, cards and tokens, whose thumbnails arrive through `PublishedImage` at their own shapes. */
export const Arrival = meta.story({
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
    await openTab(page, 'Shared inventory');
    await settled(async () => {
      for (const label of ['Treachery deck', ...drawerFactions.map(({ data }) => `${data.name} tokens`)]) {
        const thumbnail = page.getByRole('button', { name: `Drag ${label} onto the table` });
        await expect(thumbnail).toBeEnabled();
        await expect(within(thumbnail).getByRole('img', { name: label }).closest('[data-phase]')).toHaveAttribute(
          'data-phase',
          'shown'
        );
      }
    });
  },
});

export const HiddenDeckBacks = meta.story({
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
    await openTab(page, 'Shared inventory');
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
