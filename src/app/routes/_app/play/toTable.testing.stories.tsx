import { testingPreview } from '@sb/preview';
import type { Decorator } from '@storybook/tanstack-react';
import { createMemoryHistory } from '@tanstack/react-router';
import { useEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { confirmStoryProvisioning, useStorybookDatabaseClient } from '@db/storybook';

import { StorybookPage } from '../../storybook';
import { pageStoryMeta } from '../../storybookConfig';
import { chooseRuleset, creatable } from './create.route.stories.fixture';
import { drafting, install, session } from './game.stories.fixture';
import { signedIn } from './index.stories.fixture';
import { waitForTableOpen } from './mapView.stories.fixture';
import { GameRuntimeContext } from './multiplayer/gameRuntime';
import { productTransport } from './product.stories.fixture';

/* The story's browser-local database, kept so the play function can stand in for the game Worker that provisions the table. */
const database: { client: ReturnType<typeof useStorybookDatabaseClient> | null } = { client: null };

function KeepDatabase() {
  const client = useStorybookDatabaseClient();
  useEffect(() => {
    database.client = client;
  }, [client]);
  return null;
}

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Play/Create to table',
  args: { path: '/play/create' },
  /* The journey ends in the table's arrival, so it plays it. */
  parameters: { ...pageStoryMeta.parameters, ...creatable, tableArrival: 'play' },
  globals: { motion: 'on' },
  beforeEach: install(() => {
    history = createMemoryHistory({ initialEntries: ['/play/create'] });
    return productTransport('seat-1', drafting());
  }),
  render: (args) => <StorybookPage {...args} history={history} />,
  decorators: [
    ((Story) => (
      <GameRuntimeContext value={session.runtime}>
        <KeepDatabase />
        <Story />
      </GameRuntimeContext>
    )) satisfies Decorator,
  ],
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* The journey ends once the table has opened out of the planet and its scene is in view; a drafting table keeps its camera dial behind the draft. */
async function seated(canvasElement: HTMLElement) {
  const document = canvasElement.ownerDocument;
  await waitForTableOpen(document, 60_000);
  await expect(await within(document.body).findByRole('img', { name: 'Game table' })).toBeVisible();
}

/* The page's own address, so the play function can find the game the page opened. */
let history = createMemoryHistory({ initialEntries: ['/play/create'] });

/* What the game Worker does once the table is set: it confirms the attempt, and the game page moves on from preparing. */
async function provision() {
  const address = history.location.pathname.replace('/play/', '');
  if (!(await confirmStoryProvisioning(database.client!, creatable.identity, [address]))) {
    throw new Error(`No game was created at ${address}.`);
  }
}

/**
 * The whole way from the create page to a seated table, at a player's pace.
 * The player chooses a ruleset and presses Create game.
 * The page departs while the planet rises, waits in its orbit while the table is prepared and connected, and the table opens out of the planet onto the seats.
 * The play function plays the player and the game Worker, so watch it with motion on.
 */
export const CreateToSeating = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await pause(1500);
    await userEvent.click(page.getByRole('button', { name: 'Create game' }));
    await page.findByText('Preparing the table', {}, { timeout: 30_000 });
    /* A real table takes a few seconds to prepare. */
    await pause(3000);
    await provision();
    await seated(canvasElement);
  },
});

/**
 * Joining a game already under way: the player opens a table with a free seat from the lobby.
 * The lobby departs as the create page does, the planet rises into the table's frame, and the table opens out of it onto the seats.
 */
export const LobbyToSeating = meta.story({
  args: { path: '/play' },
  parameters: signedIn,
  beforeEach: () => {
    history = createMemoryHistory({ initialEntries: ['/play'] });
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const open = await page.findByRole('link', { name: 'Open Gom Jabbar party' }, { timeout: 30_000 });
    /* The player reaches the link a moment before they press it, which starts loading the table. */
    open.focus();
    await pause(1500);
    await userEvent.click(open);
    await seated(canvasElement);
  },
});
