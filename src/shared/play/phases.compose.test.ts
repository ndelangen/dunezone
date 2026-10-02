import { describe, expect, it } from 'vitest';

import type { PhaseDeclaration } from '../factions/extraPhases';
import { capturedDeclarations, factionCaptureSchema } from './capture';
import type { FactionCapture } from './capture';
import { applyPieceAction } from './commands';
import { freshTableState } from './model';
import { composeSetup, composeTurn, lobbyPhaseIndex, phaseAt, STANDARD_PHASES, tableProgressFor } from './phases';
import { GameRejection } from './rejection';
import type { TableRoster } from './schema';
import { phaseGate } from './setup';
import { stormOrder } from './stormSector';

function declaration(overrides: Partial<PhaseDeclaration> & Pick<PhaseDeclaration, 'id'>): PhaseDeclaration {
  return {
    type: 'instruction',
    title: overrides.id,
    symbol: '/vector/icon/fate.svg',
    before: 'bidding',
    priority: 10,
    allPlayersMustBeReady: false,
    ...overrides,
  };
}

/* Two seats: station 0 sits in sector 13, station 1 in sector 4. */
const roster: TableRoster = {
  seatCount: 2,
  seats: [
    { id: 'seat-a', position: 0, faction: { id: 'atreides', name: 'Atreides', color: '#00f' } },
    { id: 'seat-b', position: 1, faction: { id: 'harkonnen', name: 'Harkonnen', color: '#f00' } },
  ],
};

const beforeBidding = (turn: ReturnType<typeof composeTurn>) =>
  turn
    .slice(
      0,
      turn.findIndex((entry) => entry.id === 'bidding')
    )
    .filter((entry) => entry.kind === 'faction');

describe('storm order (#1138)', () => {
  it('ranks seats by the sectors the storm still has to travel, a seat under the marker last', () => {
    expect(stormOrder(5, roster)).toEqual(['harkonnen', 'atreides']);
    /* One step counter-clockwise puts the storm over Harkonnen, which it has now passed. */
    expect(stormOrder(4, roster)).toEqual(['atreides', 'harkonnen']);
    expect(stormOrder(13, roster)).toEqual(['harkonnen', 'atreides']);
  });

  it('leaves out seats without a faction and reads an absent roster as no order', () => {
    expect(stormOrder(5, { ...roster, seats: [{ ...roster.seats[0]!, faction: null }, roster.seats[1]!] })).toEqual([
      'harkonnen',
    ]);
    expect(stormOrder(5, undefined)).toEqual([]);
  });
});

describe('composition (#1138)', () => {
  const tie = [
    { factionId: 'atreides', declarations: [declaration({ id: 'a' })] },
    { factionId: 'harkonnen', declarations: [declaration({ id: 'h' })] },
  ];

  it('orders equal priorities at one target by storm order, and swaps them once the storm passes one', () => {
    expect(beforeBidding(composeTurn(tie, stormOrder(5, roster))).map((entry) => entry.id)).toEqual([
      'harkonnen:h',
      'atreides:a',
    ]);
    expect(beforeBidding(composeTurn(tie, stormOrder(4, roster))).map((entry) => entry.id)).toEqual([
      'atreides:a',
      'harkonnen:h',
    ]);
  });

  it('holds different priorities regardless of storm', () => {
    const ranked = [
      { factionId: 'atreides', declarations: [declaration({ id: 'a', priority: 1 })] },
      { factionId: 'harkonnen', declarations: [declaration({ id: 'h', priority: 20 })] },
    ];
    for (const storm of [4, 5, 13]) {
      expect(beforeBidding(composeTurn(ranked, stormOrder(storm, roster))).map((entry) => entry.id)).toEqual([
        'atreides:a',
        'harkonnen:h',
      ]);
    }
  });

  it('follows the author list order for one faction at the same target and priority', () => {
    const listed = [
      { factionId: 'atreides', declarations: [declaration({ id: 'second' }), declaration({ id: 'first' })] },
    ];
    expect(beforeBidding(composeTurn(listed, [])).map((entry) => entry.id)).toEqual([
      'atreides:second',
      'atreides:first',
    ]);
  });

  it('runs a declaration before Traitors once in setup and one before Bidding every turn', () => {
    const factions = [
      {
        factionId: 'atreides',
        declarations: [declaration({ id: 'setup', before: 'traitors' }), declaration({ id: 'turn' })],
      },
    ];
    const setup = composeSetup(factions, []);
    expect(setup.traitors.map((placed) => placed.declaration.id)).toEqual(['setup']);
    expect(setup.forces).toEqual([]);

    const turn = composeTurn(factions, []);
    expect(turn).toHaveLength(STANDARD_PHASES.length + 1);
    expect(turn.map((entry) => entry.id)).not.toContain('atreides:setup');
    expect(turn[turn.findIndex((entry) => entry.id === 'bidding') - 1]).toMatchObject({
      id: 'atreides:turn',
      kind: 'faction',
      factionId: 'atreides',
      before: 'bidding',
    });
    /* The same entry in every turn: the counter keeps counting and the turn follows the composed length. */
    const index = turn.findIndex((entry) => entry.id === 'atreides:turn');
    expect(phaseAt(index + turn.length, turn).id).toBe('atreides:turn');
    expect(tableProgressFor(index + turn.length, turn).turn).toBe(2);
  });

  it('keeps the standard nine when nobody declares anything', () => {
    expect(composeTurn([], [])).toEqual(STANDARD_PHASES);
  });
});

describe('the storm guard and readiness (#1138)', () => {
  it('refuses the storm command outside the Storm phase', () => {
    const state = freshTableState();
    const turn = composeTurn(
      [{ factionId: 'atreides', declarations: [declaration({ id: 'x', before: 'storm' })] }],
      []
    );
    expect(() => applyPieceAction(state, { kind: 'storm', direction: 1 }, 0, 'A player', turn)).toThrow(
      new GameRejection('The storm moves only during the Storm phase.')
    );
    expect(applyPieceAction(state, { kind: 'storm', direction: 1 }, 1, 'A player', turn).stormSectorIndex).not.toBe(
      state.stormSectorIndex
    );
    expect(() => applyPieceAction(state, { kind: 'storm', direction: 1 }, 3)).toThrow(/only during the Storm phase/);
  });

  it('gates Next on readiness for an instruction phase only when its toggle is on', () => {
    const turn = composeTurn(
      [
        {
          factionId: 'atreides',
          declarations: [
            declaration({ id: 'gated', allPlayersMustBeReady: true }),
            declaration({ id: 'free', before: 'revival' }),
          ],
        },
      ],
      []
    );
    const gate = (id: string, ready: string[]) =>
      phaseGate({
        stage: 'play',
        phase: turn.findIndex((entry) => entry.id === id),
        phases: turn,
        ready,
        seats: ['seat-a', 'seat-b'],
      });
    expect(gate('atreides:gated', ['seat-a'])).toEqual({
      needsReady: true,
      refusal: 'Every seated player must be ready before advancing.',
    });
    expect(gate('atreides:gated', ['seat-a', 'seat-b']).refusal).toBeNull();
    expect(gate('atreides:free', [])).toEqual({ needsReady: false, refusal: null });
    expect(gate('mentat-pause', []).needsReady).toBe(true);
  });
});

describe('lobby phase index (#1138)', () => {
  it('reports the same turn and the standard phase an entry is at or precedes', () => {
    const turn = composeTurn([{ factionId: 'atreides', declarations: [declaration({ id: 'deal' })] }], ['atreides']);
    const deal = turn.findIndex((entry) => entry.id === 'atreides:deal');
    const bidding = STANDARD_PHASES.findIndex((phase) => phase.id === 'bidding');
    expect(lobbyPhaseIndex(turn.length + deal, turn)).toBe(STANDARD_PHASES.length + bidding);
    expect(lobbyPhaseIndex(turn.length + deal + 1, turn)).toBe(STANDARD_PHASES.length + bidding);
    expect(lobbyPhaseIndex(turn.length - 1, turn)).toBe(STANDARD_PHASES.length - 1);
    expect(lobbyPhaseIndex(12)).toBe(12);
  });
});

describe('captured declarations (#1138)', () => {
  it('reads a stored row the live schema no longer accepts without failing, and leaves it out', () => {
    const renamed = { ...declaration({ id: 'old' }), symbol: '/vector/icon/renamed.svg' };
    const definition = factionCaptureSchema.shape.definition.shape.extraPhases;
    expect(definition.safeParse([declaration({ id: 'kept' }), renamed]).success).toBe(true);
    const capture = { definition: { extraPhases: [declaration({ id: 'kept' }), renamed] } } as FactionCapture;
    expect(capturedDeclarations(capture).map((row) => row.id)).toEqual(['kept']);
  });
});
