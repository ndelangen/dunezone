import type { PieceAction } from '../../src/shared/play/protocol';
type BattlePlan = Extract<PieceAction, { kind: 'battle-plan' }>['plan'];
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

import { BATTLE_COUNTDOWN_MS } from '../../src/shared/play/battle';
import { JourneyRecorder, PLAYERS, territoryName, territoryPosition } from './journey.native.fixture.ts';
import {
  dealTraitors,
  drafting,
  keepTraitors,
  predict,
  startingTroops,
  stormAndSpice,
  trading,
} from './journey.script.ts';
import { eventually, required, syncView } from './native-runtime.fixture.ts';

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

/* Bidding, where two factions buy a Treachery card each, then shipments that bring House Harkonnen into Arrakeen. */
async function biddingAndShipment(journey: JourneyRecorder) {
  await journey.next(0, 'CHOAM Charity', 'The CHOAM Charity phase opens.');
  await journey.next(0, 'Bidding', 'The Bidding phase opens.');
  for (const [order, slug] of ['house-atreides', 'emperor'].entries()) {
    const index = journey.indexOf(journey.id(slug));
    const treachery = await journey.deck('deck:treachery-deck');
    await journey.act(
      0,
      { kind: 'deck-draw', pieceId: required(treachery).id, recipient: required(journey.factionAt(index)).id },
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
  await journey.next(0, 'Shipment and Movement', 'The Shipment and Movement phase opens.');
  for (const [slug, count, territory] of [
    ['house-harkonnen', 5, 'arrakeen'],
    ['spacing-guild', 3, 'imperial-basin'],
  ] as const) {
    const index = await journey.moveTroops(slug, count, territory);
    await journey.record(
      'Shipment',
      `${journey.who(index)} ships ${count} troops to ${territoryName(territory)}.`,
      `seat-${index + 1}`,
      {
        kind: 'drop',
      }
    );
  }
}

/*
 * The fixture troops carry no authored battle values, so no troop can be dialed and no spice can support one.
 * Each side commits a leader alone, and the reveal shows 0 strength and 0 spice, as the step text says.
 */
async function battlePlan(journey: JourneyRecorder, index: number): Promise<BattlePlan> {
  const leader = (await journey.hand(index)).find((piece) => piece.kind === 'force');
  return { mode: 'custom', troops: [], spice: 0, adjustment: 0, leaderIds: [required(leader).id], cardIds: [] };
}

/* A battle in Arrakeen between House Harkonnen and House Atreides, from the claim to an agreed outcome. */
async function battle(journey: JourneyRecorder) {
  await journey.next(0, 'Battle', 'The Battle phase opens: House Harkonnen and House Atreides share Arrakeen.');
  const sides = [journey.indexOf(journey.id('house-harkonnen')), journey.indexOf(journey.id('house-atreides'))];
  const [invader, defender] = sides;
  const started = await journey.command(invader, {
    kind: 'battle-start',
    anchor: territoryPosition('arrakeen'),
    territory: 'Arrakeen',
  });
  const battleId = required(started.snapshot.battle).id;
  await journey.record('Battle started', `${journey.who(invader)} opens a battle in Arrakeen.`, `seat-${invader + 1}`, {
    kind: 'battle-start',
  });
  for (const [side, index] of sides.entries()) {
    const which = side === 0 ? 'left' : 'right';
    await journey.act(
      index,
      { kind: 'battle-claim', battleId, side: side === 0 ? 0 : 1 },
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
      `${journey.who(index)} commits a leader; the fixture troops have no battle values to dial.`
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
  const outcome: PieceAction = { kind: 'battle-outcome', battleId, outcome: 'right' };
  await journey.act(invader, outcome, 'Battle outcome', `${journey.who(invader)} agrees House Atreides won.`);
  await journey.act(defender, outcome, 'Battle resolved', `${journey.who(defender)} agrees; the battle is settled.`);
}

/* The turn ends and the creator declares House Atreides the winner. */
async function finish(journey: JourneyRecorder) {
  await journey.next(0, 'Spice Collection', 'The Spice Collection phase opens.');
  await journey.next(0, 'Mentat Pause', 'The Mentat Pause ends the turn.');
  await journey.act(0, { kind: 'result-open' }, 'Determining the winner', `${PLAYERS[0]} opens the result.`);
  await journey.act(
    0,
    { kind: 'result-declare', result: 'faction', factionIds: [journey.id('house-atreides')] },
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
        predict,
        dealTraitors,
        keepTraitors,
        startingTroops,
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
