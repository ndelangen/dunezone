import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';

import { draftingSnapshot, storyPlayer } from './drafting.stories.fixture';
import { drafting, gameMeta, install, lastCommand, MIDWAY, press, session, shows } from './game.stories.fixture';
import { productTransport, parameters, SIX } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Drafting',
});

/** A real game opens drafting: the creator alone in seat 1, the three steps before the deal in the header, and no (+) for a player. */
export const WaitingForPlayers = meta.story({
  beforeEach: install(() => productTransport('seat-1', draftingSnapshot([storyPlayer('seat-1', 'thialfi')], 4))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The table arrives with its chunk and the connection, so every read waits for the header. */
    await waitFor(
      () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        expect(header).toBeInstanceOf(HTMLElement);
        expect(within(header as HTMLElement).getByText('Waiting for 3 more players')).toBeVisible();
        expect(page.queryByRole('group', { name: 'Phase navigation' })).toBeNull();
        expect(within(header as HTMLElement).getByRole('list', { name: 'Before the deal' })).toHaveTextContent(
          /Players 1\/4\+.*Factions.*Ready 0\/1/
        );
        expect(within(header as HTMLElement).getByRole('button', { name: 'Copy invite link' })).toBeVisible();
        expect(within(header as HTMLElement).getByRole('button', { name: 'Ready' })).toBeVisible();
        /* The (+) is a spectator's way into the roster, never a player's. */
        expect(page.queryByRole('button', { name: 'Take a seat' })).toBeNull();
        /* Nothing sits between the board and the controls. */
        expect(canvasElement.ownerDocument.querySelector('[data-decision-bar]')).toBeNull();
        /* The seated player is cited through ProfileLink, leading to their profile. */
        expect(
          within(page.getByRole('region', { name: 'Players' })).getByRole('link', { name: 'Thialfi' })
        ).toHaveAttribute('href', '/profiles/thialfi');
      },
      { timeout: 30_000 }
    );
  },
});

/** Players left a six-seat table that deals from four: the header waits for the draft's minimum, never the table's seat count. */
export const PlayersLeftBelowMinimum = meta.story({
  beforeEach: install(() => productTransport('seat-1', draftingSnapshot(SIX.slice(0, 2), 6, { minimum: 4 }))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Waiting for 2 more players', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByRole('list', { name: 'Before the deal' })).toHaveTextContent(/Players 2\/4\+/);
  },
});

/* The maximum table keeps all eighteen stations visible while six players wait for the remaining seats. */
export const EighteenSeats = meta.story({
  parameters: parameters('ready', undefined, 18),
  beforeEach: install(() => productTransport('seat-2', draftingSnapshot(SIX, 18))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Waiting for 12 more players', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.__duneTable?.stations()).toHaveLength(18));
    /* Ready is the header's, beside the gear, as in play. */
    const header = canvasElement.ownerDocument.querySelector('.seated-header') as HTMLElement;
    expect(within(header).getByRole('button', { name: 'Ready' })).toBeVisible();
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
      () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        expect(within(header as HTMLElement).getByText('Waiting for 5 to be ready')).toBeVisible();
        expect(
          within(page.getByRole('region', { name: 'Banned factions' })).getByRole('img', {
            name: /Ixians, banned by Twaffle/,
          })
        ).toBeVisible();
        expect(within(page.getByRole('region', { name: 'Drafted factions' })).getAllByRole('img')).toHaveLength(9);
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

/** A spectator sees the same ledger with a (+) to ask for a seat, and none of the drafting tools. */
export const Observer = meta.story({
  beforeEach: install(() => productTransport('neutral', draftingSnapshot(SIX, 6, MIDWAY))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByRole('button', { name: 'Take a seat' }));
    await shows(() => page.getByRole('region', { name: 'Drafted factions' }));
    expect(page.queryByLabelText('Search factions')).toBeNull();
    expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
  },
});

/** Bans have left too few factions for six players: the note blocks, and nobody can be dealt. */
export const InsufficientFactionPool = meta.story({
  beforeEach: install(() =>
    productTransport(
      'seat-2',
      draftingSnapshot(SIX, 6, {
        picks: { 'seat-1': ['house-atreides'], 'seat-2': ['fremen'] },
        bans: {
          'seat-1': ['house-harkonnen', 'emperor', 'ixians'],
          'seat-3': ['spacing-guild', 'bene-gesserit', 'bene-tleilax'],
          'seat-4': ['iduali', 'ecaz-ecaz-moritani', 'moritani-ecaz-moritani', 'richese', 'ginaz'],
        },
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await waitFor(
      () => {
        expect(headerAlert(canvasElement)).toHaveTextContent('Not enough factions in the pool');
        expect(headerAlert(canvasElement)).toHaveTextContent('Remove a ban or draft more factions');
      },
      { timeout: 30_000 }
    );
  },
});

/** The drafting chip's warning line, with the help it carries for assistive technology; it speaks through the header's polite region, so it has no alert role of its own. */
function headerAlert(canvasElement: HTMLElement) {
  const header = canvasElement.ownerDocument.querySelector<HTMLElement>('.seated-header')!;
  return within(header)
    .getByText(/^(Seats were not dealt|Not enough factions in the pool)/u)
    .closest('strong');
}

/** The deal found a drafted faction unready: it is set aside with its reason, readiness cleared, and it cannot be drafted again until it is ready. */
const NOT_READY = 'faction token, The faction token back has no published face.';
export const FactionSetAside = meta.story({
  beforeEach: install(() =>
    productTransport(
      'seat-2',
      draftingSnapshot(SIX, 6, {
        picks: { 'seat-1': ['house-atreides', 'iduali'], 'seat-2': ['fremen'] },
        setAside: { iduali: NOT_READY },
        failure: `Set aside as not ready to deal: Iduali (${NOT_READY.replace(/\.$/, '')}).`,
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await waitFor(
      () => expect(headerAlert(canvasElement)).toHaveTextContent('Set aside as not ready to deal: Iduali'),
      { timeout: 30_000 }
    );
    const list = () => within(page.getByRole('list', { name: 'Factions' }));
    await shows(() => list().getByText(`Not ready to deal: ${NOT_READY}`));
    const row = list().getByText('Iduali').closest('li') as HTMLElement;
    expect(within(row).getByRole('button', { name: /^Draft$/ })).toBeDisabled();
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
    expect(headerAlert(canvasElement)).toHaveTextContent('Seats were not dealt');
    expect(page.queryByRole('button', { name: 'Ready' })).toBeNull();
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
    expect(page.queryByRole('button', { name: 'Seats' })).toBeNull();
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
    expect(page.queryByRole('tab', { name: 'Drafting' })).toBeNull();
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

/** The requester waits in the roster, where their (+) was, and can take the request back. */
export const WaitingForApproval = meta.story({
  beforeEach: install(() =>
    productTransport('neutral', drafting([{ id: 'seat-request-2', requesterName: 'Klyzx', seat: null, own: true }]))
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByText('Waiting for approval'));
    expect(page.queryByRole('button', { name: 'Take a seat' })).toBeNull();
    await press(() => page.getByRole('button', { name: 'Withdraw your seat request' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-withdraw' } }));
  },
});

/** Each request waits in the roster under the seated players, where any player approves it. */
export const PlayerApprovesARequest = meta.story({
  beforeEach: install(() =>
    productTransport(
      'seat-1',
      drafting([
        { id: 'seat-request-2', requesterName: 'Klyzx', seat: null },
        { id: 'seat-request-3', requesterName: 'Erickenneth', seat: null },
      ])
    )
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const players = () => within(page.getByRole('region', { name: 'Players' }));
    await shows(() => players().getByRole('img', { name: 'Klyzx asks for a seat' }));
    await shows(() => players().getByRole('img', { name: 'Erickenneth asks for a seat' }));
    const klyzx = () => within(players().getByText('Klyzx').closest('li') as HTMLElement);
    await press(() => klyzx().getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'seat-approve', requestId: 'seat-request-2' },
      })
    );
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
    expect(session.transport.messages.some((message) => message.type === 'command')).toBe(false);
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-depart' } }), {
      timeout: 10_000,
    });
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

/** A discarded game keeps its table readable and offers no seat; the phase chip says why. */
export const Discarded = meta.story({
  beforeEach: install(() => productTransport('neutral', { ...drafting(), stage: 'discarded' })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(
      () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header') as HTMLElement;
        expect(within(header).getByText('Its last player left')).toBeVisible();
      },
      { timeout: 30_000 }
    );
    expect(page.queryByRole('button', { name: 'Seats' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Take a seat' })).toBeNull();
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
    expect(canvasElement.ownerDocument.querySelector('.seated-header')).not.toHaveTextContent(
      'Annual Bene Gesserit wedding traitor and the unexpected Arrakeen dinner ambush'
    );
    expect(
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
    const copy = await page.findByRole('button', { name: 'Copy game link' });
    await userEvent.click(copy);
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/\/play\/annual-bene-gesserit-wedding-traitor-and-the-unexpected-arrakeen$/)
    );
    await waitFor(() => expect(copy).toHaveTextContent('Game link copied'));
  },
});
