import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BATTLE_COUNTDOWN_MS } from '../../src/shared/play/battle';
import {
  factionFixtures,
  JourneyRecorder,
  PLAYERS,
  SUFFIXES,
  territoryName,
  territoryPosition,
} from './journey.native.fixture.mjs';
import { eventually, seat, syncView } from './native-runtime.fixture.mjs';

/*
 * Records one real six-seat game for the Play journey stories (`src/app/routes/_app/play/journey.stories.tsx`).
 * The game Worker runs exactly as in every native suite. After each step the recorder keeps the full view every seat
 * and a spectator receive, so the stories replay engine output rather than hand-built snapshots.
 * Run with `bun run play:record`; without RECORD_JOURNEY this suite is skipped.
 */

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/app/routes/_app/play/journey.recording/journey.json'
);

/* Drafting: the creator opens the table, five players sit down through the creator's approval, and the draft deals. */
async function drafting(journey) {
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
  for (const [index, faction] of factionFixtures.entries()) {
    await journey.act(
      index,
      { kind: 'draft-pick', factionId: faction.slug },
      'Draft pick',
      `${PLAYERS[index]} picks ${faction.data.name} for the draft.`
    );
  }
  await journey.act(
    0,
    { kind: 'draft-ban', factionId: 'ixians' },
    'Draft ban',
    `${PLAYERS[0]} bans Ixians from the draft.`
  );
  const ready = { kind: 'draft-ready', ready: true };
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

/* Trading: every seat keeps what it was dealt. */
async function trading(journey) {
  for (const [index, connection] of journey.players.entries()) {
    const view = await syncView(connection);
    const action = {
      kind: 'swap-ready',
      ready: true,
      round: view.snapshot.swapping.round,
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

/* Traitor selection: gather the six decks, shuffle, and deal four to every seat. */
async function dealTraitors(journey) {
  await journey.act(
    0,
    { kind: 'traitors-gather' },
    'Traitors gathered',
    `${PLAYERS[0]} combines every Traitor deck into one pile.`
  );
  await journey.act(
    0,
    { kind: 'deck-shuffle', pieceId: (await journey.deck('cards:traitor')).id },
    'Traitors shuffled',
    `${PLAYERS[0]} shuffles the Traitor pile.`
  );
  for (let round = 0; round < 4; round++) {
    for (let index = 0; index < journey.players.length; index++) {
      const pile = await journey.deck('cards:traitor');
      await journey.command(0, { kind: 'deck-draw', pieceId: pile.id, recipient: journey.factionAt(index).id });
    }
    if (round === 0) {
      await journey.record('Dealing Traitors', `${PLAYERS[0]} has dealt one Traitor to every seat.`, 'seat-1', {
        kind: 'deck-draw',
      });
    }
  }
  await journey.record('Traitors dealt', 'Every seat holds four Traitors in hand.', 'seat-1', { kind: 'deck-draw' });
}

/*
 * Every faction but House Harkonnen keeps one Traitor and returns the other three to the pile, as a player does:
 * each card is played from the hand onto the table beside the pile, then carried onto it.
 */
async function keepTraitors(journey) {
  const pileAt = (await journey.deck('cards:traitor')).position;
  const beside = [pileAt[0] + 1.2, pileAt[1], pileAt[2]];
  for (let index = 0; index < journey.players.length; index++) {
    if (journey.factionAt(index).id === 'house-harkonnen') {
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
      await journey.carry(index, played.id, [pile.position[0], 0.4, pile.position[2]]);
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

/* Starting forces, following each faction's own setup text. */
async function startingForces(journey) {
  await journey.next(0, 'Starting forces', 'The map is revealed and every faction places its starting forces.');
  for (const [slug, count, territory] of [
    ['house-atreides', 10, 'arrakeen'],
    ['house-harkonnen', 10, 'carthag'],
    ['spacing-guild', 5, 'tueks'],
    ['fremen', 4, 'tabr'],
    ['fremen', 3, 'false-wall-south'],
    ['fremen', 3, 'false-wall-west'],
    ['bene-gesserit', 1, 'polar'],
  ]) {
    const index = await journey.moveTroops(slug, count, territory);
    const forces = `${count} ${count === 1 ? 'force' : 'forces'}`;
    await journey.record(
      'Starting forces',
      `${journey.who(index)} places ${forces} in ${territoryName(territory)}.`,
      `seat-${index + 1}`,
      {
        kind: 'drop',
      }
    );
  }
  await journey.readyAll('Setup complete', 'Every faction has placed its forces and confirmed Ready.');
}

/* Turn 1 opens: the storm moves and the Spice blow places 8 spice on Broken Land. */
async function stormAndSpice(journey) {
  await journey.next(0, 'Turn 1: Storm', 'Setup ends and the first turn opens on the Storm phase.');
  for (let sector = 0; sector < 3; sector++) {
    await journey.command(0, { kind: 'storm', direction: 1 });
  }
  await journey.record('Storm moved', `${PLAYERS[0]} moves the storm three sectors.`, 'seat-1', {
    kind: 'storm',
    direction: 1,
  });
  await journey.next(0, 'Spice blow', 'The Spice blow phase opens.');
  const spiceDeck = await journey.deck('deck:spice-deck');
  const before = new Set((await journey.hand(0)).map((piece) => piece.id));
  await journey.act(
    0,
    { kind: 'deck-draw', pieceId: spiceDeck.id },
    'Spice card drawn',
    `${PLAYERS[0]} draws the top Spice card into hand.`
  );
  const inHand = (await journey.hand(0)).find((piece) => !before.has(piece.id));
  const beside = [spiceDeck.position[0] - 1.2, 0.4, spiceDeck.position[2]];
  const drawn = await journey.created(() =>
    journey.act(
      0,
      { kind: 'hand-play', pieceId: inHand.id, position: beside },
      'Spice card played',
      `${PLAYERS[0]} plays the Spice card beside the deck.`
    )
  );
  if (!drawn.items[0].faceUp) {
    await journey.act(
      0,
      { kind: 'flip', pieceId: drawn.id },
      'Spice card revealed',
      `${PLAYERS[0]} turns the Spice card face up.`
    );
  }
  const blow = await journey.created(() =>
    journey.act(
      0,
      { kind: 'spice-spawn', count: 8 },
      'Spice from the supply',
      `${PLAYERS[0]} takes the 8 spice the card names from the supply.`
    )
  );
  await journey.carry(0, blow.id, territoryPosition('broken-land'));
  await journey.record('Spice placed', `${PLAYERS[0]} places 8 spice on Broken Land.`, 'seat-1', { kind: 'drop' });
}

/* Bidding, where two factions buy a Treachery card each, then shipments that bring House Harkonnen into Arrakeen. */
async function biddingAndShipment(journey) {
  await journey.next(0, 'CHOAM charity', 'The CHOAM charity phase opens.');
  await journey.next(0, 'Bidding', 'The Bidding phase opens.');
  for (const [order, slug] of ['house-atreides', 'emperor'].entries()) {
    const index = journey.indexOf(slug);
    const treachery = await journey.deck('deck:treachery-deck');
    await journey.act(
      0,
      { kind: 'deck-draw', pieceId: treachery.id, recipient: journey.factionAt(index).id },
      'Card won',
      `${journey.who(index)} wins the ${order === 0 ? 'first' : 'second'} Treachery card.`
    );
    await journey.act(
      index,
      { kind: 'bank-withdraw', amount: 2 },
      'Bid paid',
      `${journey.who(index)} pays 2 spice for it.`
    );
  }
  await journey.next(0, 'Revival', 'The Revival phase opens.');
  await journey.next(0, 'Shipment and movement', 'The Shipment and movement phase opens.');
  for (const [slug, count, territory] of [
    ['house-harkonnen', 5, 'arrakeen'],
    ['spacing-guild', 3, 'imperial-basin'],
  ]) {
    const index = await journey.moveTroops(slug, count, territory);
    await journey.record(
      'Shipment',
      `${journey.who(index)} ships ${count} forces to ${territoryName(territory)}.`,
      `seat-${index + 1}`,
      {
        kind: 'drop',
      }
    );
  }
}

/*
 * The fixture troops carry no authored combat values, so no troop can be dialed and no spice can support one.
 * Each side commits a leader alone, and the reveal shows 0 force and 0 spice, as the step text says.
 */
async function battlePlan(journey, index) {
  const leader = (await journey.hand(index)).find((piece) => piece.kind === 'force');
  return { mode: 'custom', troops: [], spice: 0, adjustment: 0, leaderId: leader.id, cardIds: [] };
}

/* A battle in Arrakeen between House Harkonnen and House Atreides, from the claim to an agreed outcome. */
async function battle(journey) {
  await journey.next(0, 'Battle', 'The Battle phase opens: House Harkonnen and House Atreides share Arrakeen.');
  const sides = [journey.indexOf('house-harkonnen'), journey.indexOf('house-atreides')];
  const [invader, defender] = sides;
  const started = await journey.command(invader, {
    kind: 'battle-start',
    anchor: territoryPosition('arrakeen'),
    territory: 'Arrakeen',
  });
  const battleId = started.snapshot.battle.id;
  await journey.record('Battle started', `${journey.who(invader)} opens a battle in Arrakeen.`, `seat-${invader + 1}`, {
    kind: 'battle-start',
  });
  for (const [side, index] of sides.entries()) {
    const which = side === 0 ? 'left' : 'right';
    await journey.act(
      index,
      { kind: 'battle-claim', battleId, side },
      'Battle side',
      `${journey.who(index)} takes the ${which} side.`
    );
  }
  for (const index of sides) {
    const plan = await battlePlan(journey, index);
    await journey.act(
      index,
      { kind: 'battle-plan', battleId, plan },
      'Battle plan',
      `${journey.who(index)} commits a leader; the fixture troops have no combat values to dial.`
    );
  }
  await journey.act(
    invader,
    { kind: 'battle-ready', battleId, ready: true },
    'Battle ready',
    `${journey.who(invader)} locks the plan.`
  );
  await journey.act(
    defender,
    { kind: 'battle-ready', battleId, ready: true },
    'Battle countdown',
    `${journey.who(defender)} locks the plan; the reveal counts down.`
  );
  await journey.advanceClock(BATTLE_COUNTDOWN_MS + 1);
  await eventually(
    async () => (await syncView(journey.players[invader])).snapshot.battle?.stage === 'revealed',
    'the reveal'
  );
  await journey.record('Battle revealed', 'Both plans are revealed side by side.');
  const outcome = { kind: 'battle-outcome', battleId, outcome: 'right' };
  await journey.act(invader, outcome, 'Battle outcome', `${journey.who(invader)} agrees House Atreides won.`);
  await journey.act(defender, outcome, 'Battle resolved', `${journey.who(defender)} agrees; the battle is settled.`);
}

/* The turn ends and the creator declares House Atreides the winner. */
async function finish(journey) {
  await journey.next(0, 'Spice collection', 'The Spice collection phase opens.');
  await journey.next(0, 'Mentat pause', 'The Mentat pause ends the turn.');
  await journey.act(0, { kind: 'result-open' }, 'Determining the winner', `${PLAYERS[0]} opens the result.`);
  await journey.act(
    0,
    { kind: 'result-declare', result: 'faction', factionIds: ['house-atreides'] },
    'Game finished',
    `${PLAYERS[0]} declares House Atreides the winner.`
  );
}

describe.runIf(process.env.RECORD_JOURNEY)('The Play journey recording', { timeout: 600_000 }, () => {
  it('records a six-seat game from drafting to a declared result', async () => {
    const journey = await JourneyRecorder.open();
    try {
      for (const chapter of [
        drafting,
        trading,
        dealTraitors,
        keepTraitors,
        startingForces,
        stormAndSpice,
        biddingAndShipment,
        battle,
        finish,
      ]) {
        await chapter(journey);
      }
      expect(await journey.stage()).toBe('finished');
      await journey.write(OUTPUT);
    } finally {
      await journey.close();
    }
  });
});
