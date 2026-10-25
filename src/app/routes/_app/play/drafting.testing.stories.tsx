import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';

import { draftingSnapshot, storyPlayer } from './drafting.stories.fixture';
import { drafting, gameMeta, install, lastCommand, MIDWAY, press, session, shows } from './game.stories.fixture';
import { productTransport, parameters, SIX } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Drafting',
});

/* The maximum table keeps all eighteen stations visible while six players wait for the remaining seats. */
export const EighteenSeats = meta.story({
  parameters: { ...parameters('ready', undefined, 18) },
  beforeEach: install(() => productTransport('seat-2', draftingSnapshot(SIX, 18))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Waiting for 12 more players', {}, { timeout: 30_000 })).resolves.toBeVisible();
    /*
     * The stations are read off the scene, which mounts only once the renderer has started and the scene's assets have loaded.
     * That takes about three seconds after the canvas appears on an idle machine, and more than the default wait's ten on a busy runner.
     * Eighteen seats is the heaviest table, and on CI a frame once ran 8 s late, so the scene had not mounted within 30 s (#2265).
     * The wait delivers the frames the renderer asks for and takes the camera's startup bound, as `waitForPlayCamera` does.
     */
    await waitForFrame(
      () => expect(canvasElement.ownerDocument.defaultView?.__duneTable?.stations() ?? []).toHaveLength(18),
      { timeout: 60_000 }
    );
    /* Ready is the header's, beside the gear, as in play. */
    const header = canvasElement.ownerDocument.querySelector('.seated-header') as HTMLElement;
    await expect(within(header).getByRole('button', { name: 'Ready' })).toBeVisible();
  },
});

/** Six real players midway: one ban strips a pick from the pool, one player is ready, and the note says a random six of nine will be dealt. */
export const ChoosingFactions = meta.story({
  beforeEach: install(() => productTransport('seat-2', draftingSnapshot(SIX, 6, MIDWAY))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await waitFor(
      async () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        await expect(within(header as HTMLElement).getByText('Waiting for 5 to be ready')).toBeVisible();
        await expect(
          within(page.getByRole('region', { name: 'Banned factions' })).getByRole('img', {
            name: /Ixians, banned by Twaffle/,
          })
        ).toBeVisible();
        await expect(within(page.getByRole('region', { name: 'Drafted factions' })).getAllByRole('img')).toHaveLength(
          9
        );
      },
      { timeout: 30_000 }
    );
    const factions = () => within(page.getByRole('list', { name: 'Before the deal' })).getByText(/^Factions/);
    await userEvent.hover(factions());
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('a random 6 of them will be dealt'));
    await userEvent.unhover(factions());
    const list = () => within(page.getByRole('list', { name: 'Factions' }));
    await waitFor(
      async () => {
        await userEvent.click(list().getAllByRole('button', { name: /^Draft$/, pressed: false })[0]!);
      },
      { timeout: 30_000 }
    );
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'draft-pick' } }));
    await userEvent.click(page.getByRole('button', { name: /^Ready$/ }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'draft-ready', ready: true } })
    );
  },
});

/** A spectator asks for a seat with the (+) under the seated players; it sends the one seat command a spectator may send. */
export const SpectatorAsksForASeat = meta.story({
  beforeEach: install(() => productTransport('neutral', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* While drafting the (+) is the way in, so the header's Seats popover waits for play. */
    await press(() => page.getByRole('button', { name: 'Take a seat' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-request' } }));
    await expect(page.queryByRole('button', { name: 'Seats' })).toBeNull();
  },
});

/** A spectator seated during drafting lands on the drafting tab, not the Log they watched from (#1666). */
export const SeatedSpectatorLandsOnDrafting = meta.story({
  beforeEach: install(() => productTransport('neutral', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByRole('button', { name: 'Take a seat' }));
    /* A spectator's dock holds the Log alone, so that is where it opens. */
    await shows(() => page.getByRole('tab', { name: 'History' }));
    await expect(page.queryByRole('tab', { name: 'Drafting' })).toBeNull();
    const seated = session.transport.view({
      ...draftingSnapshot([SIX[0]!, SIX[1]!], 6),
      revision: drafting().revision + 1,
    });
    seated.viewer = { ...seated.viewer, viewerSeat: 'seat-2' };
    session.transport.deliver(seated);
    await waitFor(() => expect(page.getByRole('tab', { name: 'Drafting' })).toHaveAttribute('aria-selected', 'true'), {
      timeout: 30_000,
    });
  },
});

/** Giving up a seat is held in the game menu, its words naming what it costs; a plain click sends nothing. */
export const PlayerLeavesTheGame = meta.story({
  beforeEach: install(() => productTransport('seat-1', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await press(() => page.getByRole('button', { name: 'Game menu' }));
    const leave = () => page.getByRole('menuitem', { name: 'Hold to leave and discard the game' });
    await waitForFrame(() => expect(leave()).toBeVisible(), { timeout: 30_000 });
    await userEvent.pointer([{ keys: '[MouseLeft>]', target: leave() }]);
    await waitForFrame(() => expect(page.getByText(/Leaving in \d\.\./)).toBeVisible());
    await expect(session.transport.messages.some((message) => message.type === 'command')).toBe(false);
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-depart' } }), {
      timeout: 10_000,
    });
  },
});

/** The name stays in the accessible page title, outside the table header; the menu exposes the final address. */
export const NamedGame = meta.story({
  parameters: parameters(
    'ready',
    undefined,
    4,
    'Annual Bene Gesserit wedding traitor and the unexpected Arrakeen dinner ambush'
  ),
  beforeEach: install(() => productTransport('seat-1', draftingSnapshot([storyPlayer('seat-1', 'thialfi')], 4))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText(/· Dreamrules/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(canvasElement.ownerDocument.querySelector('.seated-header')).not.toHaveTextContent(
      'Annual Bene Gesserit wedding traitor and the unexpected Arrakeen dinner ambush'
    );
    await expect(
      page.getByRole('heading', {
        name: 'Annual Bene Gesserit wedding traitor and the unexpected Arrakeen dinner ambush',
        level: 1,
      })
    ).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    /* The menu shows no address; Copy game link puts the final one on the clipboard. */
    const writeText = spyOn(
      canvasElement.ownerDocument.defaultView!.navigator.clipboard,
      'writeText'
    ).mockResolvedValue();
    await userEvent.click(await page.findByRole('button', { name: 'Copy game link' }));
    /*
     * The button's "Game link copied" label lasts two seconds, and this table page can take longer than that to commit it on the runner, so Play/Create's Custom Name Created story checks the label on the page before the table opens.
     * This story checks the address the long name produces.
     */
    await expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/\/play\/annual-bene-gesserit-wedding-traitor-and-the-unexpected-arrakeen$/)
    );
  },
});
