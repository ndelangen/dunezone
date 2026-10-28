/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type { GameSnapshot } from '@shared/play/protocol';
import { cleanup, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { FACTION_INFO } from '../../play/compass/windows';
import { stubMatchMedia } from '../../play/multiplayer/jsdom.test.fixture';
import { FactionInfoHeader } from '../../play/panels/factionInfo/FactionInfoHeader';
import type { TablePlayers } from './chapterScript';
import { moderation } from './moderation';

stubMatchMedia();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const FACTIONS = ['House Harkonnen', 'Fremen', 'Emperor', 'House Atreides', 'Spacing Guild'];
const seats = FACTIONS.map((name, index) => ({ id: `seat-${index + 2}`, faction: { name } }));
const ballots = () => seats.slice(1).map((seat) => ({ seat: seat.id, choice: null }));

/* A learner who turns their ballot to Keep can sink the vote; the vote they start next still gets the others' ballots. */
test('the others vote on a second vote after the first one fails', () => {
  let view = {
    roster: { seats },
    removalVotes: [{ id: 'vote-1', target: { seat: 'seat-2' }, ballots: ballots() }],
  } as unknown as GameSnapshot;
  const act = vi.fn();
  const players: TablePlayers = {
    act,
    viewOf: () => view,
    others: () => [],
    landings: () => [],
    captured: () => undefined,
  };
  const votes = moderation.tasks(() => view, players).find((step) => step.id === 'votes')!;
  const stop = votes.begin(undefined as never) as () => void;
  vi.advanceTimersByTime(1500);
  expect(act).toHaveBeenLastCalledWith('seat-3', { kind: 'removal-ballot', voteId: 'vote-1', choice: 'remove' });
  view = { roster: { seats }, removalVotes: [] } as unknown as GameSnapshot;
  vi.advanceTimersByTime(3000);
  expect(act).toHaveBeenCalledOnce();
  view = {
    roster: { seats },
    removalVotes: [{ id: 'vote-2', target: { seat: 'seat-2' }, ballots: ballots() }],
  } as unknown as GameSnapshot;
  vi.advanceTimersByTime(1500);
  expect(act).toHaveBeenLastCalledWith('seat-3', { kind: 'removal-ballot', voteId: 'vote-2', choice: 'remove' });
  stop();
});

/* Another player's faction information has the same button, so opening it first neither finishes the step nor moves the arrow there. */
test('the first step waits for the Harkonnen player’s information, not another player’s', () => {
  const view = { roster: { seats } } as unknown as GameSnapshot;
  const players: TablePlayers = {
    act: vi.fn(),
    viewOf: () => view,
    others: () => [],
    landings: () => [],
    captured: () => undefined,
  };
  const steps = moderation.tasks(() => view, players);
  const open = steps.find((step) => step.id === 'open')!;
  const start = steps.find((step) => step.id === 'start')!;
  /* The header the table renders, named as it names a seat, so the guide reads what a player sees rather than markup of its own. */
  const info = (seatId: string, faction: string) =>
    render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <div data-window={FACTION_INFO}>
          <FactionInfoHeader
            model={{
              token: null,
              name: 'Thialfi',
              faction,
              seatId,
              seat: seatId.replace('seat-', 'Seat '),
              own: false,
              alliance: null,
              page: null,
              removal: { start: vi.fn() },
            }}
          />
        </div>
      </MantineProvider>
    );
  const anchor = () => (start.anchor.kind === 'page' ? start.anchor.element() : null);
  info('seat-5', 'House Atreides');
  expect(open.done(open.begin(undefined as never), undefined as never)).toBe(false);
  expect(anchor()).toBeNull();
  cleanup();
  info('seat-2', 'House Harkonnen');
  expect(open.done(open.begin(undefined as never), undefined as never)).toBe(true);
  expect(anchor()?.closest('[data-faction-info-seat]')?.getAttribute('data-faction-info-seat')).toBe('seat-2');
  cleanup();
});
