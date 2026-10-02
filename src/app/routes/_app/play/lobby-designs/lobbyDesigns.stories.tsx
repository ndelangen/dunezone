import preview from '@sb/preview';
import type { ComponentType } from 'react';

import { AppRoot } from '@app/shell/AppRoot';
import { ShellPageBackdrop } from '@app/shell/ShellStoryPage.stories.fixture';

import { CommandLobby } from './CommandLobby';
import { GalleryLobby } from './GalleryLobby';
import { LedgerLobby } from './LedgerLobby';
import { ENTRIES } from './lobbyDesigns.fixture';

/*
 * Three directions for the Play lobby, for the design session on #1739.
 * Each renders the same games inside the real site chrome, and every control works on local state:
 * filters filter, a game opens its details, and Create a game opens its form, but nothing reaches a server.
 */
const meta = preview.meta({
  title: 'Play/Lobby designs',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Three proposals for the Play lobby (#1739), each with the same ten games. A: Command, built around the games you sit in. B: Ledger, one dense list with filters and a detail pane. C: Gallery, every game a card with its seats drawn round a table.',
      },
    },
  },
  decorators: [
    (Story) => (
      <ShellPageBackdrop>
        <Story />
      </ShellPageBackdrop>
    ),
  ],
});

const design = (Lobby: ComponentType<{ entries: typeof ENTRIES }>, entries = ENTRIES) => ({
  /* The site chrome renders router links, and the router decorator sits inside every meta decorator, so the chrome mounts in the render. */
  render: () => (
    <AppRoot>
      <Lobby entries={entries} />
    </AppRoot>
  ),
});

/** A: your own games first, as large cards with the next step; open seats and past games below. */
export const ACommand = meta.story({ name: 'A · Command', ...design(CommandLobby) });

/** B: one list of every game, filtered and searched, with a detail pane for the chosen game. */
export const BLedger = meta.story({ name: 'B · Ledger', ...design(LedgerLobby) });

/** C: every game a card showing its seats round a table, with Create a game as the first card. */
export const CGallery = meta.story({ name: 'C · Gallery', ...design(GalleryLobby) });

/** The three with no games at all, for the empty state. */
export const ACommandEmpty = meta.story({ name: 'A · Command, no games', ...design(CommandLobby, []) });
export const BLedgerEmpty = meta.story({ name: 'B · Ledger, no games', ...design(LedgerLobby, []) });
export const CGalleryEmpty = meta.story({ name: 'C · Gallery, no games', ...design(GalleryLobby, []) });

/** The three on a phone. */
export const ACommandPhone = meta.story({
  name: 'A · Command, phone',
  globals: { viewport: { value: 'appMobile' } },
  ...design(CommandLobby),
});
export const BLedgerPhone = meta.story({
  name: 'B · Ledger, phone',
  globals: { viewport: { value: 'appMobile' } },
  ...design(LedgerLobby),
});
export const CGalleryPhone = meta.story({
  name: 'C · Gallery, phone',
  globals: { viewport: { value: 'appMobile' } },
  ...design(GalleryLobby),
});
