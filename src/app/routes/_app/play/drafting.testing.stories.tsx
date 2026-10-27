import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { completeHold } from '@ui/control/useHoldToConfirm.stories.fixture';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';

import { windowNamed } from './controls.stories.fixture';
import { draftingSnapshot, storyPlayer, headerAlert, NOT_READY } from './drafting.stories.fixture';
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
    /* The Factions step says how the deal picks, in its own words, which its tooltip shows on hover. */
    await expect(
      within(page.getByRole('list', { name: 'Before the deal' })).getByRole('button', {
        name: /^Factions.*a random 6 of them will be dealt/,
      })
    ).toBeVisible();
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

/** A spectator seated during drafting sees the Drafting window open, which they had nothing of while watching (#1666). */
export const SeatedSpectatorLandsOnDrafting = meta.story({
  beforeEach: install(() => productTransport('neutral', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByRole('button', { name: 'Take a seat' }));
    await shows(() => page.getByRole('button', { name: /^Controls/ }));
    await expect(windowNamed(page, 'Drafting')).toBeNull();
    const seated = session.transport.view({
      ...draftingSnapshot([SIX[0]!, SIX[1]!], 6),
      revision: drafting().revision + 1,
    });
    seated.viewer = { ...seated.viewer, viewerSeat: 'seat-2' };
    session.transport.deliver(seated);
    await waitFor(() => expect(windowNamed(page, 'Drafting')).toBeVisible(), { timeout: 30_000 });
  },
});

/** Giving up a seat is held in the game menu, its words naming what it costs; the finished hold departs the seat. */
export const PlayerLeavesTheGame = meta.story({
  beforeEach: install(() => productTransport('seat-1', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await press(() => page.getByRole('button', { name: 'Game menu' }));
    const leave = () => page.getByRole('menuitem', { name: 'Hold to leave and discard the game' });
    await waitForFrame(() => expect(leave()).toBeVisible(), { timeout: 30_000 });
    await completeHold(leave());
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

/** Players left a six-seat table that deals from four: the header waits for the draft's minimum, never the table's seat count. */
export const PlayersLeftBelowMinimum = meta.story({
  beforeEach: install(() => productTransport('seat-1', draftingSnapshot(SIX.slice(0, 2), 6, { minimum: 4 }))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Waiting for 2 more players', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('list', { name: 'Before the deal' })).toHaveTextContent(/Players 2\/4\+/);
  },
});

/**
 * The panel's search filters the draft's own list of factions, which every viewer already holds in the game's snapshot (at most 500, the ruleset's own first).
 * A typed word reaches past the suitable ones to every faction, so "Show all" need not be on.
 */
export const SearchedFactions = meta.story({
  beforeEach: install(() => productTransport('seat-2', draftingSnapshot(SIX, 6, MIDWAY))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const search = await page.findByRole('textbox', { name: 'Search factions' }, { timeout: 30_000 });
    await userEvent.type(search, 'ecaz');
    const list = () => within(page.getByRole('list', { name: 'Factions' }));
    await waitFor(() => expect(list().getAllByRole('listitem')).toHaveLength(2));
    await expect(list().getByText('Ecaz (Ecaz/Moritani)')).toBeVisible();
    await expect(list().getByText('Moritani (Ecaz/Moritani)')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Show all factions' })).not.toBeChecked();
  },
});

/** A spectator reads why the deal failed in the header; dealing again is the players' Ready. */
export const ObserverAfterAFailedDeal = meta.story({
  beforeEach: install(() =>
    productTransport(
      'neutral',
      draftingSnapshot(SIX, 6, {
        picks: { 'seat-1': ['house-atreides', 'iduali'], 'seat-2': ['fremen'] },
        setAside: { iduali: NOT_READY },
        failure: `Set aside as not ready to deal: Iduali (${NOT_READY.replace(/\.$/, '')}).`,
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(
      () => expect(headerAlert(canvasElement)).toHaveTextContent('Set aside as not ready to deal: Iduali'),
      { timeout: 30_000 }
    );
    await expect(headerAlert(canvasElement)).toHaveTextContent('Seats were not dealt');
    await expect(page.queryByRole('button', { name: 'Ready' })).toBeNull();
  },
});

/** A spectator's game menu has nothing to give up. */
export const SpectatorGameMenu = meta.story({
  beforeEach: install(() => productTransport('neutral', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByRole('button', { name: 'Take a seat' }));
    await press(() => page.getByRole('button', { name: 'Game menu' }));
    await waitForFrame(() =>
      expect(page.getByRole('menuitem', { name: 'Give up your seat' })).toHaveAttribute('data-disabled')
    );
  },
});
