/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { draftingSnapshot, storyPlayer, variantDraftingSnapshot } from '../drafting.stories.fixture';
import { DraftingHeader, DraftingOverlay, DraftingPanel, DraftingReady } from './Drafting';
import { stubMatchMedia } from './jsdom.test.fixture';

stubMatchMedia();

afterEach(cleanup);

/* Unlinked, so the ledger draws their avatars without a router to lead to their profiles. */
const PLAYERS = [storyPlayer('seat-1', 'central'), storyPlayer('seat-2', 'ridwan')].map((player) => ({
  ...player,
  slug: null,
}));

/* Only what the drafting views read of a projection: the snapshot, the viewer's seat and whether it may act. */
function projection(viewerSeat: string, snapshot = draftingSnapshot(PLAYERS, 4)): TableProjection {
  return {
    snapshot,
    viewer: { viewerSeat },
    canInteract: viewerSeat !== 'neutral',
    seatCommandPending: false,
  } as unknown as TableProjection;
}

function show(element: React.ReactElement) {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      {element}
    </MantineProvider>
  );
}

const client = { command: vi.fn() } as unknown as TableSession;

test('search respects the ruleset filter until Show all factions is enabled', () => {
  const snapshot = draftingSnapshot(PLAYERS, 4);
  const unlinked = { ...snapshot.draft!.factions[0]!, name: 'Space Orks', linked: false };
  const table = projection('seat-1', { ...snapshot, draft: { ...snapshot.draft!, factions: [unlinked] } });
  show(<DraftingPanel client={client} table={table} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Search factions' }), { target: { value: 'ork' } });
  expect(screen.queryByText('Space Orks', { exact: true })).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: 'Show all factions' }));
  expect(screen.getByText('Space Orks', { exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('switch', { name: 'Show all factions' }));
  expect(screen.queryByText('Space Orks', { exact: true })).toBeNull();
});

/** A faction's row in the panel's list, found by the whole name it shows. */
function row(name: string) {
  const list = within(screen.getByRole('list', { name: 'Factions' }));
  return within(list.getByRole('img', { name }).closest('li')!);
}

test('a row names its variant only when its Faction has several, and the search finds a variant by its name', () => {
  show(<DraftingPanel client={client} table={projection('seat-1', variantDraftingSnapshot(PLAYERS, 4))} />);
  expect(row('House Atreides · Classic').getByText('Classic', { exact: false }).textContent).toBe(' ·\u00A0Classic');
  /* Fremen has the one variant, and Ixians is a row from before rows named their Faction: neither names a variant. */
  expect(row('Fremen').getByText('Fremen').textContent).toBe('Fremen');
  expect(row('Ixians').getByText('Ixians').textContent).toBe('Ixians');
  fireEvent.change(screen.getByRole('textbox', { name: 'Search factions' }), { target: { value: 'atreides kwisatz' } });
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(row('House Atreides · Kwisatz Haderach')).toBeTruthy();
});

test('a sibling of the drafted variant says which variant was drafted and cannot be drafted beside it', () => {
  const command = vi.fn();
  const snapshot = variantDraftingSnapshot(PLAYERS, 4, { picks: { 'seat-2': ['house-atreides-classic'] } });
  show(<DraftingPanel client={{ command } as unknown as TableSession} table={projection('seat-1', snapshot)} />);
  for (const sibling of ['House Atreides · Original', 'House Atreides · Kwisatz Haderach']) {
    expect(row(sibling).getByText('Drafted as Classic')).toBeTruthy();
    const draft = row(sibling).getByRole('button', { name: 'Draft' });
    expect(draft.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(draft.getAttribute('aria-describedby')!)?.textContent).toBe('Drafted as Classic.');
    fireEvent.click(draft);
  }
  expect(command).not.toHaveBeenCalled();
  /* The drafted variant itself stays open to another player, and so does a Faction with nothing drafted. */
  expect(row('House Atreides · Classic').getByRole('button', { name: 'Draft' }).hasAttribute('aria-disabled')).toBe(
    false
  );
  expect(row('House Harkonnen · Brutal').getByRole('button', { name: 'Draft' }).hasAttribute('aria-disabled')).toBe(
    false
  );
});

test('a ban on one variant shows on every variant of the Faction, and the seat that banned it lifts it from any of them', () => {
  const command = vi.fn();
  const snapshot = variantDraftingSnapshot(PLAYERS, 4, { bans: { 'seat-1': ['house-harkonnen-brutal'] } });
  const session = { command } as unknown as TableSession;
  show(<DraftingPanel client={session} table={projection('seat-1', snapshot)} />);
  for (const variant of ['House Harkonnen · Original', 'House Harkonnen · Brutal']) {
    expect(row(variant).getByText('Banned; remove every ban on it first')).toBeTruthy();
    expect(row(variant).getByText('banned')).toBeTruthy();
    expect(row(variant).getByRole('img', { name: PLAYERS[0]!.name })).toBeTruthy();
    expect(row(variant).getByRole('button', { name: 'Banned', pressed: true })).toBeTruthy();
  }
  fireEvent.click(row('House Harkonnen · Original').getByRole('button', { name: 'Banned' }));
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: 'draft-unban', factionId: 'house-harkonnen' });
});

test("another seat reads who banned a sibling and may add its own ban, never lift the other's", () => {
  const command = vi.fn();
  const snapshot = variantDraftingSnapshot(PLAYERS, 4, { bans: { 'seat-1': ['house-harkonnen-brutal'] } });
  show(<DraftingPanel client={{ command } as unknown as TableSession} table={projection('seat-2', snapshot)} />);
  expect(row('House Harkonnen · Original').getByRole('img', { name: PLAYERS[0]!.name })).toBeTruthy();
  fireEvent.click(row('House Harkonnen · Original').getByRole('button', { name: 'Ban', pressed: false }));
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: 'draft-ban', factionId: 'house-harkonnen' });
});

test('the ledger names a drafted variant, and shows one banned token for a Faction banned through two variants', () => {
  const snapshot = variantDraftingSnapshot(PLAYERS, 4, {
    picks: { 'seat-2': ['house-atreides-classic', 'fremen'] },
    bans: { 'seat-1': ['house-harkonnen-brutal'], 'seat-2': ['house-harkonnen'] },
  });
  show(<DraftingOverlay client={client} table={projection('seat-1', snapshot)} />);
  const drafted = within(screen.getByRole('region', { name: 'Drafted factions' }));
  expect(drafted.getByRole('img', { name: `House Atreides · Classic, drafted by ${PLAYERS[1]!.name}` })).toBeTruthy();
  expect(drafted.getByRole('img', { name: `Fremen, drafted by ${PLAYERS[1]!.name}` })).toBeTruthy();
  const banned = within(screen.getByRole('region', { name: 'Banned factions' }));
  expect(banned.getAllByRole('img')).toHaveLength(1);
  expect(
    banned.getByRole('img', { name: `House Harkonnen, banned by ${PLAYERS[0]!.name}, ${PLAYERS[1]!.name}` })
  ).toBeTruthy();
  const players = within(screen.getByRole('region', { name: 'Players' }));
  expect(players.getByRole('img', { name: `${PLAYERS[1]!.name} drafted House Atreides · Classic` })).toBeTruthy();
  expect(players.getByRole('button', { name: 'Remove your ban on House Harkonnen' })).toBeTruthy();
});

function withRequests(seatRequests: { id: string; requesterName: string; seat: null; own?: boolean }[]) {
  const snapshot = draftingSnapshot(PLAYERS, 4);
  return { ...snapshot, controls: { ...snapshot.controls!, seatRequests } };
}

test("a spectator's refused seat request is said beneath the roster where it was asked", () => {
  show(<DraftingOverlay client={client} table={projection('neutral')} error="The table is full." />);
  expect(screen.getByText('The table is full.')).toBeTruthy();
});

test('the drafting chip draws the three steps before the deal, ringing the first one not met', () => {
  show(
    <DraftingHeader
      table={projection('seat-1', draftingSnapshot(PLAYERS, 6, { minimum: 4 }))}
      rulesetName="Dreamrules"
    />
  );
  expect(screen.getByText('Dreamrules', { exact: false })).toBeTruthy();
  expect(screen.getByRole('list', { name: 'Before the deal' }).textContent).toMatch(
    /Players 2\/4\+.*Factions 0\/2.*Ready 0\/2/
  );
  expect(screen.getByText('Waiting for 2 more players')).toBeTruthy();
});

test("a player sees no (+) in the roster: it is a spectator's way to ask for a seat", () => {
  show(<DraftingOverlay client={client} table={projection('seat-1', draftingSnapshot(PLAYERS, 6, { minimum: 4 }))} />);
  expect(screen.queryByRole('button', { name: 'Take a seat' })).toBeNull();
});

test("a spectator sees only their own request, never anyone else's", () => {
  show(
    <DraftingOverlay
      client={client}
      table={projection('neutral', withRequests([{ id: 'other', requesterName: 'Klyzx', seat: null }]))}
    />
  );
  expect(screen.queryByText('Klyzx')).toBeNull();
  expect(screen.getByRole('button', { name: 'Take a seat' })).toBeTruthy();
});

test('after a failed deal a ready player deals again instead of withdrawing', () => {
  const command = vi.fn();
  const snapshot = draftingSnapshot(PLAYERS, 2, { failure: 'Set aside as not ready to deal: Iduali (no token).' });
  const ready = { ...snapshot, draft: { ...snapshot.draft!, ready: ['seat-1'] } } as typeof snapshot;
  show(<DraftingReady client={{ command } as unknown as TableSession} table={projection('seat-1', ready)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Deal again' }));
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: 'draft-ready', ready: true });
});
