import { TUTORIAL_PLAYERS } from '@shared/tutorial/players';
import { describe, expect, it } from 'vite-plus/test';

import { createAGame } from '../chapterScripts/createAGame';
import { findAGame } from '../chapterScripts/findAGame';
import { seatTutorialPlayers, shuffledPlayers, withoutViewer } from '../players';
import recording from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from '../table/localTable';
import { FRIEND_ADDRESS, sampleLobby } from './lobbyGames';
import { openedTable } from './openedTable';

const setup = recording as unknown as TutorialSetup;
const origin = 'https://dune.zone';

describe('tutorial players and lobby transitions', () => {
  it('shuffles distinct people while preserving every mechanical seat and faction', () => {
    const people = shuffledPlayers(() => 0.25);
    expect(new Set(people.map((player) => player.slug)).size).toBe(7);
    expect(people).not.toEqual(TUTORIAL_PLAYERS);
    const relabelled = seatTutorialPlayers(setup, people);
    const before = startAt(setup, 'turn-1-storm', origin);
    const after = startAt(relabelled, 'turn-1-storm', origin);
    expect(after.stored).toEqual(before.stored);
    expect(Object.values(after.viewers).map((viewer) => viewer.userId)).toEqual(
      Object.values(before.viewers).map((viewer) => viewer.userId)
    );
    const table = new LocalTable(after);
    expect(table.frame().snapshot.controls?.players.map((player) => player.name)).toEqual([
      'You',
      ...people.slice(0, 5).map((player) => player.name),
    ]);
    expect(
      table
        .frame()
        .snapshot.controls?.players.every(
          (player) => player.name === 'You' || player.avatar?.startsWith('/user-images/')
        )
    ).toBe(true);
    table.dispose();
  });

  it.each(TUTORIAL_PLAYERS)('finds $name with three letters and opens the same players', (friend) => {
    const people = TUTORIAL_PLAYERS.filter((player) => player !== friend);
    people.splice(1, 0, friend);
    const seated = seatTutorialPlayers(setup, people, { watch: true });
    const state = { ...findAGame.start(1, friend.name), query: friend.name.slice(0, 3).toUpperCase() };
    const tasks = findAGame.tasks(
      () => state,
      () => {},
      friend.name
    );
    expect(tasks.find((task) => task.id === 'find')!.done(undefined, {} as never)).toBe(true);
    const game = sampleLobby(seated).ongoing.find((game) => game.slug === FRIEND_ADDRESS)!;
    expect(game.seatsFilled).toBeLessThan(game.seatCount);
    const table = new LocalTable(openedTable(seated, { kind: 'found', address: FRIEND_ADDRESS }, origin));
    expect(table.frame().viewer.viewerSeat).toBe('neutral');
    expect(table.frame().snapshot.controls?.players.map((player) => player.name)).toEqual(
      game.players.map((player) => player.displayName)
    );
    table.dispose();
  });

  it('creates a drafting table with the chosen settings and only the creator seated', () => {
    const table = new LocalTable(
      openedTable(
        setup,
        {
          kind: 'created',
          request: {
            name: 'Arrakis with friends',
            rulesetId: 'tutorial-dreamrules',
            minimumPlayers: 4,
            lastTurn: 8,
          },
        },
        origin
      )
    );
    const { snapshot, viewer } = table.frame();
    expect(snapshot.stage).toBe('drafting');
    expect(snapshot.lastTurn).toBe(8);
    expect(snapshot.roster).toEqual({ seatCount: 4, seats: [{ id: 'seat-1', position: 0, faction: null }] });
    expect(snapshot.draft?.minimum).toBe(4);
    expect(snapshot.controls?.players.map((player) => player.name)).toEqual(['Central']);
    expect(viewer.viewerSeat).toBe('seat-1');
    table.dispose();
  });

  it.each(TUTORIAL_PLAYERS)('never casts the signed-in player $name as a tutorial opponent', (viewer) => {
    const people = withoutViewer(TUTORIAL_PLAYERS, { slug: viewer.slug, username: viewer.name });
    for (const chapter of [{}, { watch: true }, { playAs: 'Fremen' }]) {
      const seated = seatTutorialPlayers(setup, people, chapter);
      const table = new LocalTable(startAt(seated, 'turn-1-storm', origin, chapter));
      const frame = table.frame();
      expect(frame.viewer.displayName).toBe('You');
      expect(frame.snapshot.controls?.players.some((player) => player.name === viewer.name)).toBe(false);
      expect(new Set(frame.snapshot.controls?.players.map((player) => player.name)).size).toBe(
        frame.snapshot.controls?.players.length
      );
      table.dispose();
    }
  });

  it('prepares direct step links and clears all choices on reset', () => {
    expect(findAGame.start(1, 'Krell').query).toBe('Kre');
    const create = createAGame.start(4, 'Krell');
    expect(create.draft).toMatchObject({
      minimumPlayers: 4,
      lastTurn: 8,
      custom: true,
      customName: 'Arrakis with friends',
    });
    expect(create.tableReady).toBe(false);
    expect(createAGame.start(0, 'Krell').draft).toMatchObject({
      rulesetId: '',
      minimumPlayers: 6,
      lastTurn: 10,
      custom: false,
      customName: '',
    });
  });
});
