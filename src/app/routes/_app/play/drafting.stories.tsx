import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { draftingSnapshot, storyPlayer } from './drafting.stories.fixture';
import {
  decisionBar,
  drafting,
  gameMeta,
  install,
  lastCommand,
  MIDWAY,
  press,
  seatPopover,
  session,
  shows,
} from './game.stories.fixture';
import { productTransport, parameters, SIX } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Drafting',
});

/** A real game opens drafting: the creator alone in seat 1, three open seats on the ledger, the counts in the header. */
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
        expect(page.getByText('You are seated alone', { exact: false })).toBeVisible();
        expect(within(page.getByRole('region', { name: 'Players' })).getAllByTitle('Open seat')).toHaveLength(3);
        /* The seated player is cited through ProfileLink, leading to their profile. */
        expect(
          within(page.getByRole('region', { name: 'Players' })).getByRole('link', { name: 'Thialfi' })
        ).toHaveAttribute('href', '/profiles/thialfi');
      },
      { timeout: 30_000 }
    );
  },
});

/* The maximum table keeps all eighteen stations visible while six players wait for the remaining seats. */
export const EighteenSeats = meta.story({
  parameters: parameters('ready', undefined, 18),
  beforeEach: install(() => productTransport('seat-2', draftingSnapshot(SIX, 18))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Waiting for 12 more players', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(within(page.getByRole('region', { name: 'Players' })).getAllByTitle('Open seat')).toHaveLength(12);
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.__duneTable?.stations()).toHaveLength(18));
    /* With others seated and nobody asking for a seat, the bar is the draft summary and Ready on one row (#1633). */
    const bar = within(page.getByRole('region', { name: 'Your seat' }));
    expect(bar.getByText('Your draft: nothing yet')).toBeVisible();
    expect(bar.getByRole('button', { name: 'Ready' })).toBeVisible();
    expect(bar.queryByText('You hold seat 2')).toBeNull();
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
    await userEvent.hover(page.getByRole('button', { name: /^Pool / }));
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('a random 6 of them will be dealt'));
    await userEvent.unhover(page.getByRole('button', { name: /^Pool / }));
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

/** A spectator sees the same ledger and the seat bar, and none of the drafting tools. */
export const Observer = meta.story({
  beforeEach: install(() => productTransport('neutral', draftingSnapshot(SIX, 6, MIDWAY))),
  play: async ({ canvasElement }) => {
    const bar = await seatPopover(canvasElement, 'You are watching');
    await shows(() => bar().getByText('Take a seat in this game?'));
    const page = within(canvasElement.ownerDocument.body);
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
        expect(page.getByRole('alert')).toHaveTextContent('Nobody can be dealt yet.');
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        expect(within(header as HTMLElement).getByText('Not enough factions in the pool')).toBeVisible();
      },
      { timeout: 30_000 }
    );
  },
});

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
    await waitFor(() => expect(page.getByRole('alert')).toHaveTextContent('Set aside as not ready to deal: Iduali'), {
      timeout: 30_000,
    });
    const list = () => within(page.getByRole('list', { name: 'Factions' }));
    await shows(() => list().getByText(`Not ready to deal: ${NOT_READY}`));
    const row = list().getByText('Iduali').closest('li') as HTMLElement;
    expect(within(row).getByRole('button', { name: /^Draft$/ })).toBeDisabled();
  },
});

/** A spectator is offered a seat; asking sends the one seat command a spectator may send. */
export const SpectatorAsksForASeat = meta.story({
  beforeEach: install(() => productTransport('neutral', drafting())),
  play: async ({ canvasElement }) => {
    const bar = await seatPopover(canvasElement, 'You are watching');
    await shows(() => bar().getByText('Take a seat in this game?'));
    await shows(() => bar().getByText(/1 player is drafting/));
    await press(() => bar().getByRole('button', { name: 'Request a seat' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-request' } }));
    expect(within(canvasElement.ownerDocument.body).queryByRole('button', { name: 'Leave game' })).toBeNull();
  },
});

/** A spectator seated during drafting lands on the drafting tab, not the Log they watched from (#1666). */
export const SeatedSpectatorLandsOnDrafting = meta.story({
  beforeEach: install(() => productTransport('neutral', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByRole('button', { name: 'Seats' }));
    /* A spectator's dock holds the Log alone, so that is where it opens. */
    await shows(() => page.getByRole('tab', { name: 'Log' }));
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

/** The requester sees their own request waiting and can take it back. */
export const WaitingForApproval = meta.story({
  beforeEach: install(() =>
    productTransport('neutral', drafting([{ id: 'seat-request-2', requesterName: 'Klyzx', seat: null, own: true }]))
  ),
  play: async ({ canvasElement }) => {
    const bar = await seatPopover(canvasElement, 'Seat requested');
    await shows(() => bar().getByText('Waiting for a player to approve you'));
    await press(() => bar().getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-withdraw' } }));
  },
});

/** A seated player is asked to approve the next request, with the others counted. */
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
    const bar = await decisionBar(canvasElement, 'Seat request');
    await shows(() => bar().getByText('Klyzx asks for a seat'));
    await shows(() => bar().getByText(/1 more request waits/));
    await press(() => bar().getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'seat-approve', requestId: 'seat-request-2' },
      })
    );
  },
});

/** Giving up a seat starts in the game menu, is confirmed in the bar with what it costs, and only then sends. */
export const PlayerLeavesTheGame = meta.story({
  beforeEach: install(() => productTransport('seat-1', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const bar = await decisionBar(canvasElement, 'Your seat');
    await shows(() => bar().getByText('You hold seat 1'));
    expect(bar().queryByRole('button', { name: 'Leave' })).toBeNull();
    const giveUp = async () => {
      await press(() => page.getByRole('button', { name: 'Game menu' }));
      await waitForFrame(() => userEvent.click(page.getByRole('menuitem', { name: 'Give up your seat' })), {
        timeout: 30_000,
      });
    };
    await giveUp();
    const leaving = await decisionBar(canvasElement, 'Leaving');
    await shows(() => leaving().getByText('You are the last player. Leaving discards the game for good.'));
    expect(session.transport.messages.some((message) => message.type === 'command')).toBe(false);
    await press(() => leaving().getByRole('button', { name: 'Stay' }));
    await decisionBar(canvasElement, 'Your seat');
    await giveUp();
    await decisionBar(canvasElement, 'Leaving');
    await press(() => leaving().getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-depart' } }));
  },
});

/** A player who left and was seated again holds the new seat without being asked to give it up. */
export const PlayerRejoinsAfterLeaving = meta.story({
  beforeEach: install(() => productTransport('seat-2', draftingSnapshot(SIX.slice(0, 2), 6))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const deliver = (viewerSeat: 'seat-2' | 'neutral') => {
      const view = session.transport.view(draftingSnapshot(SIX.slice(0, viewerSeat === 'neutral' ? 1 : 2), 6));
      session.transport.deliver({ ...view, viewer: { ...view.viewer, viewerSeat } });
    };
    await press(() => page.getByRole('button', { name: 'Game menu' }));
    await waitForFrame(() => userEvent.click(page.getByRole('menuitem', { name: 'Give up your seat' })), {
      timeout: 30_000,
    });
    const leaving = await decisionBar(canvasElement, 'Leaving');
    await press(() => leaving().getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-depart' } }));
    deliver('neutral');
    await seatPopover(canvasElement, 'You are watching');
    deliver('seat-2');
    await waitFor(() => expect(page.getByRole('region', { name: 'Your seat' })).toBeVisible(), { timeout: 30_000 });
    expect(page.queryByRole('region', { name: 'Leaving' })).toBeNull();
  },
});

/** A spectator's game menu has nothing to give up. */
export const SpectatorGameMenu = meta.story({
  beforeEach: install(() => productTransport('neutral', drafting())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByRole('button', { name: 'Seats' }));
    await press(() => page.getByRole('button', { name: 'Game menu' }));
    await waitForFrame(() =>
      expect(page.getByRole('menuitem', { name: 'Give up your seat' })).toHaveAttribute('data-disabled')
    );
  },
});

/** A discarded game keeps its table readable and offers no seat. */
export const Discarded = meta.story({
  beforeEach: install(() => productTransport('neutral', { ...drafting(), stage: 'discarded' })),
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Discarded');
    await shows(() => bar().getByText('This game was discarded'));
    expect(bar().queryByRole('button')).toBeNull();
  },
});
