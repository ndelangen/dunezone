import type { TablePiece } from '@shared/play/model';
import { item, piece } from '@shared/play/setupSupply';
import type { Decorator } from '@storybook/tanstack-react';
import type { CSSProperties } from 'react';
import { fn } from 'storybook/test';

import compass from '../compass/CompassControls.module.css';
import { WindowFrame } from '../compass/WindowFrame';
import type { TableWindow } from '../compass/windows';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '../DarkSchemeIsland';
import '../dune-play.css';
import { SHARED_INVENTORY_GUIDANCE } from '../multiplayer/panelGuidance';
import { cardBack, factions } from '../product.stories.fixture';
import { inventoryRows } from './inventoryRows';
import { dreamrulesTechTokenPieces } from './techTokens.stories.fixture';
import { drawHelp } from './useSharedInventory';
import type { SharedInventoryViewProps } from './useSharedInventory';

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
 * What the panel is shown: a Treachery deck, faction tokens and the seven Dreamrules tech tokens in the shared table inventory, with the catalogue closed and no requests waiting.
 * Every action is a spy.
 */
export function inventoryArgs(): SharedInventoryViewProps {
  const pieces = [treacheryDeck(), ...factionTokens(), ...dreamrulesTechTokenPieces()];
  return {
    inventory: {
      rows: inventoryRows(pieces),
      movable: () => true,
      carry: fn(),
      draw: { left: 7, enabled: true, help: drawHelp(7), run: fn() },
      gather: null,
      catalogue: {
        enabled: true,
        shelf: null,
        toggleShelf: fn(),
        picker: { shelf: null, types: [], selection: null, requestId: null },
        select: fn(),
      },
    },
    picker: null,
    requests: null,
  };
}

/* The window as HostedTable lists it, with its title and (?). */
const INVENTORY_WINDOW: Omit<TableWindow, 'content'> = {
  key: 'shared',
  label: 'Shared table inventory',
  group: 'Table',
  topic: 'assets',
  ...SHARED_INVENTORY_GUIDANCE,
  layout: 'stack',
};

/*
 * The panel alone, in its window's real frame, title and (?), as a pinned slot shows it:
 * inside the play shell and the compass, whose styles give the window its glass, edge and corners and the pieces their sand.
 * The shell's ground is left out, so only the window sits on the canvas.
 */
export const inWindow: Decorator = (Story) => (
  <DarkSchemeIsland>
    <div
      className="dune-play-shell"
      {...darkSchemeIslandAttributes}
      style={{ width: '46rem', height: '52rem', background: 'transparent' }}
    >
      <div className={compass.root} style={{ '--slot-width': '44rem' } as CSSProperties}>
        <WindowFrame
          entry={{ ...INVENTORY_WINDOW, content: <Story /> }}
          where="left"
          inert={false}
          style={{ height: '50rem' }}
          onSeat={() => undefined}
          onFaction={() => undefined}
          actions={null}
        />
      </div>
    </div>
  </DarkSchemeIsland>
);
