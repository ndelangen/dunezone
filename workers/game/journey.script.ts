import type { Vector3Tuple } from '../../src/shared/play/model';
import type { PieceAction } from '../../src/shared/play/protocol';
import { PLAYERS, SUFFIXES, territoryName, territoryPosition } from './journey.native.fixture.ts';
import type { JourneyRecorder } from './journey.native.fixture.ts';
import { eventually, required, seat, syncView } from './native-runtime.fixture.ts';

/*
 * The opening of a recorded game, chapter by chapter, from an empty table to the Spice Blow of turn 1.
 * The Play journey (`journey.record.native.test.ts`) and the tutorial setup (`tutorial.record.native.test.ts`) both play it,
 * each over its own content and cast.
 */

/** Drafting: the creator opens the table, five players sit down through the creator's approval, and the draft deals. */
export async function drafting(journey: JourneyRecorder) {
  journey.players.push(await journey.admit('a'));
  await journey.record(
    'Game created',
    `${PLAYERS[0]} created the game and holds seat 1 while the draft waits for players.`
  );
  for (const suffix of SUFFIXES.slice(1)) {
    const connection = await journey.admit(suffix);
    await seat(connection, journey.players[0]);
    journey.players.push(connection);
  }
  journey.spectator = await journey.admit('watcher');
  await journey.record(
    'Table full',
    "Six players are seated through the creator's approval, and Klyzx watches as a spectator."
  );
  for (const [index, faction] of journey.cast.factions.entries()) {
    await journey.act(
      index,
      { kind: 'draft-pick', factionId: faction.id },
      'Draft pick',
      `${PLAYERS[index]} picks ${faction.name} for the draft.`
    );
  }
  await journey.act(
    0,
    { kind: 'draft-ban', factionId: journey.cast.ban.id },
    'Draft ban',
    `${PLAYERS[0]} bans ${journey.cast.ban.name} from the draft.`
  );
  const ready: PieceAction = { kind: 'draft-ready', ready: true };
  for (let index = 0; index < 5; index++) {
    await journey.command(index, ready);
  }
  await journey.record('Draft nearly ready', `Five seats are ready; ${PLAYERS[5]} has not confirmed yet.`, null, ready);
  await journey.command(5, ready);
  await eventually(async () => (await journey.stage()) === 'swapping', 'the deal', 20_000);
  await journey.readRoster();
  const dealt = PLAYERS.map((_name, index) => journey.who(index)).join(', ');
  await journey.record('Factions dealt', `The deal assigned ${dealt}. Trading opens.`, 'seat-6', ready);
}

/** Trading: every seat keeps what it was dealt. */
export async function trading(journey: JourneyRecorder) {
  for (const [index, connection] of journey.players.entries()) {
    const view = await syncView(connection);
    const action: PieceAction = {
      kind: 'swap-ready',
      ready: true,
      round: required(view.snapshot.swapping).round,
      seat: view.viewer.viewerSeat,
    };
    await journey.command(index, action);
    if (index === 2) {
      await journey.record(
        'Trading',
        'Three seats keep what they were dealt; the others are still deciding.',
        'seat-3',
        action
      );
    }
  }
  await eventually(async () => (await journey.stage()) === 'setup', 'setup', 20_000);
  await journey.readRoster();
  await journey.record('Setup begins', 'Trading closed. Setup opens on Traitor selection.', 'seat-6', {
    kind: 'swap-ready',
  });
}

/** Traitor selection: gather the six decks, shuffle, and deal four to every seat. */
export async function dealTraitors(journey: JourneyRecorder) {
  await journey.act(
    0,
    { kind: 'traitors-gather' },
    'Traitors gathered',
    `${PLAYERS[0]} combines every Traitor deck into one pile.`
  );
  await journey.act(
    0,
    { kind: 'deck-shuffle', pieceId: required(await journey.deck('cards:traitor')).id },
    'Traitors shuffled',
    `${PLAYERS[0]} shuffles the Traitor pile.`
  );
  for (let round = 0; round < 4; round++) {
    for (let index = 0; index < journey.players.length; index++) {
      const pile = await journey.deck('cards:traitor');
      await journey.command(0, {
        kind: 'deck-draw',
        pieceId: required(pile).id,
        recipient: required(journey.factionAt(index)).id,
      });
    }
    if (round === 0) {
      await journey.record('Dealing Traitors', `${PLAYERS[0]} has dealt one Traitor to every seat.`, 'seat-1', {
        kind: 'deck-draw',
      });
    }
  }
  await journey.record('Traitors dealt', 'Every seat holds four Traitors in hand.', 'seat-1', { kind: 'deck-draw' });
}

/**
 * Every faction but House Harkonnen keeps one Traitor and returns the other three to the pile, as a player does: each card is played from the hand onto the table beside the pile, then carried onto it.
 */
export async function keepTraitors(journey: JourneyRecorder) {
  const pileAt = required(await journey.deck('cards:traitor')).position;
  const beside: Vector3Tuple = [pileAt[0] + 1.2, pileAt[1], pileAt[2]];
  for (let index = 0; index < journey.players.length; index++) {
    if (required(journey.factionAt(index)).id === journey.id('house-harkonnen')) {
      continue;
    }
    const dealt = (await journey.hand(index)).filter((piece) => piece.stackKey === 'cards:traitor');
    for (const card of dealt.slice(1)) {
      await journey.command(index, { kind: 'hand-play', pieceId: card.id, position: beside });
      /* Card handles change as the pile changes, so the played card is found by what it is: the one loose Traitor. */
      const traitors = (await journey.pieces(index)).filter(
        (piece) => piece.stackKey === 'cards:traitor' && !piece.inventory
      );
      const played = traitors.find((piece) => piece.items.length === 1);
      const pile = traitors.find((piece) => piece !== played);
      await journey.carry(index, required(played).id, [required(pile).position[0], 0.4, required(pile).position[2]]);
      /* The room refills each socket's message allowance from its own clock, which only moves when the journey moves it. */
      await journey.advanceClock(1000);
    }
    if (index === 0) {
      await journey.record(
        'Traitor kept',
        `${journey.who(0)} keeps one Traitor and returns three to the pile.`,
        'seat-1',
        {
          kind: 'hand-play',
        }
      );
    }
  }
  await journey.readyAll(
    'Traitors kept',
    'Every faction kept its Traitor, House Harkonnen all four, and confirmed Ready.'
  );
}

/** Starting troops, following each faction's own setup text. */
export async function startingTroops(journey: JourneyRecorder) {
  await journey.next(0, 'Starting troops', 'The map is revealed and every faction places its starting troops.');
  for (const [slug, count, territory] of [
    ['house-atreides', 10, 'arrakeen'],
    ['house-harkonnen', 10, 'carthag'],
    ['spacing-guild', 5, 'tueks'],
    ['fremen', 4, 'tabr'],
    ['fremen', 3, 'false-wall-south'],
    ['fremen', 3, 'false-wall-west'],
    ['bene-gesserit', 1, 'polar'],
  ] as const) {
    const index = await journey.moveTroops(slug, count, territory);
    const troops = `${count} ${count === 1 ? 'troop' : 'troops'}`;
    await journey.record(
      'Starting troops',
      `${journey.who(index)} places ${troops} in ${territoryName(territory)}.`,
      `seat-${index + 1}`,
      {
        kind: 'drop',
      }
    );
  }
  await journey.readyAll('Setup complete', 'Every faction has placed its troops and confirmed Ready.');
}

/** Turn 1 opens: the storm moves and the Spice Blow places 8 spice on Broken Land. */
export async function stormAndSpice(journey: JourneyRecorder) {
  await journey.next(0, 'Turn 1: Storm', 'Setup ends and the first turn opens on the Storm phase.');
  for (let sector = 0; sector < 3; sector++) {
    await journey.command(0, { kind: 'storm', direction: 1 });
  }
  await journey.record('Storm moved', `${PLAYERS[0]} moves the storm three sectors.`, 'seat-1', {
    kind: 'storm',
    direction: 1,
  });
  await journey.next(0, 'Spice Blow', 'The Spice Blow phase opens.');
  const spiceDeck = await journey.deck('deck:spice-deck');
  const before = new Set((await journey.hand(0)).map((piece) => piece.id));
  await journey.act(
    0,
    { kind: 'deck-draw', pieceId: required(spiceDeck).id },
    'Spice card drawn',
    `${PLAYERS[0]} draws the top Spice card into hand.`
  );
  const inHand = (await journey.hand(0)).find((piece) => !before.has(piece.id));
  const beside: Vector3Tuple = [required(spiceDeck).position[0] - 1.2, 0.4, required(spiceDeck).position[2]];
  const drawn = await journey.created(() =>
    journey.act(
      0,
      { kind: 'hand-play', pieceId: required(inHand).id, position: beside },
      'Spice card played',
      `${PLAYERS[0]} plays the Spice card beside the deck.`
    )
  );
  if (!required(drawn).items[0].faceUp) {
    await journey.act(
      0,
      { kind: 'flip', pieceId: required(drawn).id },
      'Spice card revealed',
      `${PLAYERS[0]} turns the Spice card face up.`
    );
  }
  const blow = await journey.created(() =>
    journey.act(
      0,
      { kind: 'spice-spawn', count: 8 },
      'Spice from the Spice Bank',
      `${PLAYERS[0]} takes the 8 spice the card names from the Spice Bank.`
    )
  );
  await journey.carry(0, required(blow).id, territoryPosition('broken-land'));
  await journey.record('Spice placed', `${PLAYERS[0]} places 8 spice on Broken Land.`, 'seat-1', { kind: 'drop' });
}
