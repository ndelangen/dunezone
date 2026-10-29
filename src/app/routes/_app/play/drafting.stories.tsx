import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { draftingSnapshot, storyPlayer, headerAlert, NOT_READY } from './drafting.stories.fixture';
import { drafting, gameMeta, install, lastCommand, MIDWAY, press, shows } from './game.stories.fixture';
import { productTransport, SIX } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Drafting',
});

/** A real game opens drafting: the creator alone in seat 1, the three steps before the deal in the header, and no (+) for a player. */
export const WaitingForPlayers = meta.story({
  beforeEach: install(() => productTransport('seat-1', draftingSnapshot([storyPlayer('seat-1', 'krell')], 4))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The table arrives with its chunk and the connection, so every read waits for the header. */
    await waitFor(
      async () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        await expect(header).toBeInstanceOf(HTMLElement);
        await expect(within(header as HTMLElement).getByText('Waiting for 3 more players')).toBeVisible();
        await expect(page.queryByRole('group', { name: 'Phase navigation' })).toBeNull();
        await expect(within(header as HTMLElement).getByRole('list', { name: 'Before the deal' })).toHaveTextContent(
          /Players 1\/4\+.*Factions.*Ready 0\/1/
        );
        await expect(within(header as HTMLElement).getByRole('button', { name: 'Copy invite link' })).toBeVisible();
        await expect(within(header as HTMLElement).getByRole('button', { name: 'Ready' })).toBeVisible();
        /* The (+) is a spectator's way into the roster, never a player's. */
        await expect(page.queryByRole('button', { name: 'Take a seat' })).toBeNull();
        const overlay = canvasElement.ownerDocument.querySelector<HTMLElement>('.seated-stage-overlay')!;
        const scene = canvasElement.ownerDocument.querySelector<HTMLElement>('.scene--immersive')!;
        await expect(overlay.getBoundingClientRect().top).toBe(scene.getBoundingClientRect().top);
        /* Nothing sits between the board and the controls. */
        await expect(canvasElement.ownerDocument.querySelector('[data-decision-bar]')).toBeNull();
        /* The seated player is cited through ProfileLink, leading to their profile. */
        await expect(
          within(page.getByRole('region', { name: 'Players' })).getByRole('link', { name: 'Krell' })
        ).toHaveAttribute('href', '/profiles/krell');
      },
      { timeout: 30_000 }
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
    await expect(page.queryByLabelText('Search factions')).toBeNull();
    await expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
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
      async () => {
        await expect(headerAlert(canvasElement)).toHaveTextContent('Not enough factions in the pool');
        await expect(headerAlert(canvasElement)).toHaveTextContent('Remove a ban or draft more factions');
      },
      { timeout: 30_000 }
    );
  },
});
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
    await expect(within(row).getByRole('button', { name: /^Draft$/ })).toBeDisabled();
  },
});

/** The requester waits in the roster, where their (+) was, and can take the request back. */
export const WaitingForApproval = meta.story({
  beforeEach: install(() =>
    productTransport(
      'neutral',
      drafting([{ id: 'seat-request-2', requesterName: 'IHasPinecone', seat: null, own: true }])
    )
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByText('Waiting for approval'));
    await expect(page.queryByRole('button', { name: 'Take a seat' })).toBeNull();
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
        { id: 'seat-request-2', requesterName: 'IHasPinecone', seat: null },
        { id: 'seat-request-3', requesterName: 'Eichmal', seat: null },
      ])
    )
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const players = () => within(page.getByRole('region', { name: 'Players' }));
    await shows(() => players().getByRole('img', { name: 'IHasPinecone asks for a seat' }));
    await shows(() => players().getByRole('img', { name: 'Eichmal asks for a seat' }));
    const ihaspinecone = () => within(players().getByText('IHasPinecone').closest('li') as HTMLElement);
    await press(() => ihaspinecone().getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'seat-approve', requestId: 'seat-request-2' },
      })
    );
  },
});

/** A discarded game keeps its table readable and offers no seat; the phase chip says why. */
export const Discarded = meta.story({
  beforeEach: install(() => productTransport('neutral', { ...drafting(), stage: 'discarded' })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(
      async () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header') as HTMLElement;
        await expect(within(header).getByText('Its last player left')).toBeVisible();
      },
      { timeout: 30_000 }
    );
    await expect(page.queryByRole('button', { name: 'Seats' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Take a seat' })).toBeNull();
  },
});
