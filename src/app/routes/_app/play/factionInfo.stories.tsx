import preview from '@sb/preview';
import type { ReactNode } from 'react';

import { VIEWER, alliancesSnapshot } from './alliances.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { FactionInfoLayoutContext } from './multiplayer/FactionInfoLayouts';
import type { FactionInfoLayout } from './multiplayer/FactionInfoLayouts';
import { productTransport } from './product.stories.fixture';

/*
 * The four layouts for the top of the Faction info, each in the real window: the Alliances window bottom left, and the Faction info bottom right on seat 4,
 * who is allied with seat 5. Press another token in the row to see a seat with an offer, with no alliance, or your own.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Faction info',
  globals: { motion: 'on', viewport: { value: 'table1280' } },
  parameters: { ...gameMeta.parameters, chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

function pinWindows() {
  try {
    localStorage.setItem(
      'dunezone-compass:slots',
      JSON.stringify({ left: { key: 'alliances' }, right: { key: 'faction-info', seat: 'seat-4' } })
    );
  } catch {
    /* Without storage the slots start empty. */
  }
}

function layoutStory(layout: FactionInfoLayout) {
  return {
    decorators: [
      (Story: () => ReactNode) => (
        <FactionInfoLayoutContext.Provider value={layout}>
          <Story />
        </FactionInfoLayoutContext.Provider>
      ),
    ],
    beforeEach: [install(() => productTransport(VIEWER, alliancesSnapshot())), pinWindows],
  };
}

/** A: token and name as the header, the faction page and removal as quiet icons beside it, the alliance in a row below. */
export const A_Header = meta.story(layoutStory('header'));

/** B: token and name, then labelled rows for the alliance and the faction page, with the removal vote alone at the end. */
export const B_Rows = meta.story(layoutStory('rows'));

/** C: token and name, the alliance under it, and every action in one strip of equal buttons. */
export const C_Strip = meta.story(layoutStory('strip'));

/** D: token and name with a ⋯ menu holding the faction page and removal, so only the alliance action shows. */
export const D_Menu = meta.story(layoutStory('menu'));
