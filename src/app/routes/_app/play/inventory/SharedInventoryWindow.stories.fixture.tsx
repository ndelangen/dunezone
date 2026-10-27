import type { Decorator } from '@storybook/tanstack-react';
import type { ComponentType } from 'react';
import { within } from 'storybook/test';

import type { StoredSnapshot } from '../../../../../../workers/game/state';
import { openControl } from '../controls.stories.fixture';
import { gameMeta, install } from '../game.stories.fixture';
import { chapter, JourneyPage } from '../journey.stories.fixture';
import { sandboxReady, sandboxTransport, withTechTokens } from '../sandbox.stories.fixture';
import { InventoryLayoutContext } from './inventoryLayout';
import type { SharedInventoryProps } from './useSharedInventory';

/* A Treachery deck someone added from the catalogue, made of the recording's Snooper and the production Treachery faces beside it. */
const TREACHERY = [
  ['snooper', 'Snooper'],
  ['crysknife', 'Crysknife'],
  ['chaumas', 'Chaumas'],
  ['shield', 'Shield'],
  ['cheap-hero', 'Cheap Hero'],
] as const;

function withTreacheryDeck(stored: StoredSnapshot): StoredSnapshot {
  const snooper = Object.values(stored.factionInventories)
    .flat()
    .find((piece) => piece.items[0]?.artwork?.name === 'Snooper');
  if (!snooper) {
    return stored;
  }
  const deck: StoredSnapshot['table']['pieces'][number] = {
    ...snooper,
    id: 'story-shared-treachery',
    label: 'Treachery deck',
    owner: 'shared',
    inventory: 'shared',
    hiddenZone: undefined,
    position: [-25, 0, -25],
    items: TREACHERY.map(([file, name]) => ({
      ...snooper.items[0]!,
      id: `story-shared-treachery-${file}`,
      faceUp: false,
      artwork: {
        ...snooper.items[0]!.artwork!,
        name,
        front: snooper.items[0]!.artwork!.front!.replace('snooper.jpg', `${file}.jpg`),
      },
    })),
  };
  return {
    ...stored,
    table: { ...stored.table, pieces: [...stored.table.pieces, deck] },
    versions: { ...stored.versions, [deck.id]: stored.revision },
  };
}

/* The table shows the layout the story names, as its `inventoryLayout` parameter, in its Shared table inventory window. */
const withLayout: Decorator = (Story, { parameters }) => (
  <InventoryLayoutContext.Provider
    value={(parameters.inventoryLayout as ComponentType<SharedInventoryProps> | undefined) ?? null}
  >
    <Story />
  </InventoryLayoutContext.Provider>
);

/*
 * The window's stories share one setup: the live sandbox table mid-game, the Battle plan step of the recorded journey,
 * holding the seven Dreamrules tech tokens and a Treachery deck in its shared table inventory, with the window open.
 */
export const inventoryWindowMeta = {
  ...gameMeta,
  component: JourneyPage,
  args: { ...gameMeta.args, step: chapter('Battle plan'), seat: 'seat-1' },
  decorators: [withLayout, ...gameMeta.decorators],
  globals: { motion: 'on' },
  beforeEach: install(() =>
    sandboxTransport({
      start: chapter('Battle plan') - 1,
      seat: 'seat-1',
      prepare: (stored) => withTreacheryDeck(withTechTokens(stored)),
    })
  ),
  loaders: [
    async () => {
      await import('../multiplayer/HostedTable');
    },
  ],
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await sandboxReady(page);
    await openControl(page, 'Shared table inventory');
  },
};
