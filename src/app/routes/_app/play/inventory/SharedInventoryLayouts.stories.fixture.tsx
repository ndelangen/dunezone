import type { TablePiece } from '@shared/play/model';
import { item, piece } from '@shared/play/setupSupply';
import type { Decorator } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';

import windows from '../compass/Windows.module.css';
import { cardBack, factions } from '../product.stories.fixture';
import { inventoryRows } from './inventoryRows';
import { dreamrulesTechTokenPieces } from './techTokens.stories.fixture';
import { drawHelp } from './useSharedInventory';
import type { InventoryLayoutProps } from './useSharedInventory';

const href = (path: string) => new URL(path, location.origin).href;

/* A Treachery deck someone added from the catalogue, face down, made of the production Treachery faces. */
function treacheryDeck(): TablePiece {
  return {
    ...piece('shared-treachery', 'Treachery deck', 'shared', '#3f3a35', 'card', 'deck:treachery'),
    inventory: 'shared',
    items: ['snooper', 'crysknife', 'chaumas', 'shield', 'cheap-hero'].map((file, index) =>
      item(
        `shared-treachery-${index}`,
        file,
        href(`/play-fixtures/dreamrules/${file}.jpg`),
        cardBack(),
        'card-treachery',
        false,
        'Treachery'
      )
    ),
  };
}

/* Three faction tokens of each of the last three captured factions, as the catalogue adds them. */
function factionTokens(): TablePiece[] {
  return factions.slice(3).map(({ slug, data, token }) => {
    const face = href(token);
    return {
      ...piece(`shared-${slug}`, `${data.name} tokens`, 'shared', data.themeColor, 'force', `token:${slug}`),
      inventory: 'shared',
      items: [0, 1, 2].map((index) =>
        item(`shared-${slug}-${index}`, `${data.name} token`, face, face, 'token-disc', true)
      ),
    };
  });
}

/**
 * What every layout is shown: a Treachery deck, faction tokens and the seven Dreamrules tech tokens in the shared table inventory, with the catalogue closed and no requests waiting.
 * Every action is a spy.
 */
export function inventoryArgs(): InventoryLayoutProps {
  const pieces = [treacheryDeck(), ...factionTokens(), ...dreamrulesTechTokenPieces()];
  const rows = inventoryRows(pieces, true);
  return {
    inventory: {
      rows,
      empty: !rows.length,
      movable: () => true,
      carry: fn(),
      draw: { left: 7, enabled: true, help: drawHelp(7), run: fn() },
      gather: null,
      catalogue: {
        enabled: true,
        open: false,
        toggle: fn(),
        picker: { open: false, selection: null, requestId: null },
        select: fn(),
      },
    },
    picker: null,
    requests: null,
  };
}

/* The panel alone, in a centre window's frame and width, as the compass opens it over the table. */
export const inWindow: Decorator = (Story) => (
  <div
    className={windows.window}
    style={{ position: 'relative', width: '44rem', maxWidth: '100%', margin: '2rem auto' }}
  >
    <div className={windows.body}>
      <Story />
    </div>
  </div>
);
