import { describe, expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { phaseAt, TABLE_PHASES, tableProgressFor } from '../../src/shared/play/phases';
import { clientMessageSchema, gameSnapshotSchema, tableForViewer } from '../../src/shared/play/protocol';
import type { GameSnapshot } from '../../src/shared/play/protocol';
import { isSpicePiece, spiceSupplySlot } from '../../src/shared/play/spiceSupply';
import { applyPatch, diff } from './history';
import { Room } from './room';

const alice = {
  connectionId: 'alice-connection',
  userId: 'alice-user',
  viewerSeat: 'harkonnen' as const,
  displayName: 'alice',
  color: '#ed927c',
};
const bob = {
  connectionId: 'bob-connection',
  userId: 'bob-user',
  viewerSeat: 'atreides' as const,
  displayName: 'bob',
  color: '#75d8a7',
};
const spectator = {
  connectionId: 'spectator-connection',
  userId: 'spectator-user',
  viewerSeat: 'neutral' as const,
  displayName: 'spectator',
  color: '#d0c8b9',
};
const items = (snapshot: GameSnapshot) =>
  snapshot.table.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort();

describe('shared phase progression', () => {
  test('selects any representable turn while preserving the phase, pieces and active carries', () => {
    const initial = { ...initialSnapshot(), phase: 3 };
    const room = new Room(initial);
    room.begin(alice, {
      carryId: 'turn-carry',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    const carries = structuredClone(room.publicCarries());
    room.accept(room.command(bob, { kind: 'turn', turn: 25 }, 0));
    expect(tableProgressFor(room.snapshot.phase)).toMatchObject({ turn: 25, activePhaseId: 'bidding' });
    expect(room.snapshot.table.pieces).toEqual(initial.table.pieces);
    expect(room.snapshot.versions).toEqual(initial.versions);
    expect(room.publicCarries()).toEqual(carries);
    expect(() => room.command(bob, { kind: 'turn', turn: 2 }, 0)).toThrow('table changed');
    expect(() => room.command(spectator, { kind: 'turn', turn: 2 }, 1)).toThrow('Spectators');
    for (const turn of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => room.command(alice, { kind: 'turn', turn }, 1)).toThrow();
    }
    room.accept(room.command(alice, { kind: 'turn', turn: 1 }, 1));
    expect(room.snapshot.phase).toBe(3);
    room.accept(room.drop(alice, 'turn-carry', [0, 0.38, 0], 0), 'turn-carry');
    expect(room.snapshot.table.pieces.some((piece) => piece.id === 'carry-turn-carry')).toBe(true);
  });
  test('accepts old forward commands and steps across turn boundaries without replaying tabletop actions', () => {
    const room = new Room(initialSnapshot());
    const command = clientMessageSchema.parse({
      type: 'command',
      commandId: 'old-client',
      action: { kind: 'phase' },
      expectedRevision: 0,
    });
    if (command.type !== 'command') {
      throw new Error('Expected a command.');
    }
    room.accept(room.command(alice, command.action, command.expectedRevision));
    expect(phaseAt(room.snapshot.phase).id).toBe('spice-blow');
    for (let index = 1; index < TABLE_PHASES.length; index++) {
      room.accept(room.command(bob, { kind: 'phase' }, room.snapshot.revision));
    }
    expect(tableProgressFor(room.snapshot.phase)).toMatchObject({ turn: 2, activePhaseId: 'storm' });
    room.accept(room.command(alice, { kind: 'storm', direction: 1 }, room.snapshot.revision));
    room.accept(room.command(alice, { kind: 'flip', pieceId: 'treachery-deck' }, room.snapshot.revision));
    const table = structuredClone(room.snapshot.table);
    const versions = structuredClone(room.snapshot.versions);

    room.accept(room.command(bob, { kind: 'phase', direction: -1 }, room.snapshot.revision));
    expect(tableProgressFor(room.snapshot.phase)).toMatchObject({ turn: 1, activePhaseId: 'mentat-pause' });
    expect(room.snapshot.table.pieces).toEqual(table.pieces);
    expect(room.snapshot.table.stormSectorIndex).toBe(table.stormSectorIndex);
    expect(room.snapshot.versions).toEqual(versions);
    expect(tableForViewer(room.snapshot, alice.viewerSeat).phase).toBe('Mentat pause');

    room.accept(room.command(alice, { kind: 'phase' }, room.snapshot.revision));
    expect(tableProgressFor(room.snapshot.phase)).toMatchObject({ turn: 2, activePhaseId: 'storm' });
    expect(room.snapshot.table.pieces).toEqual(table.pieces);
    expect(room.snapshot.table.stormSectorIndex).toBe(table.stormSectorIndex);
    expect(room.snapshot.versions).toEqual(versions);
  });

  test('rejects backward movement below Turn 1, stale changes and observer commands', () => {
    const room = new Room(initialSnapshot());
    const initial = structuredClone(room.snapshot);
    expect(() => room.command(alice, { kind: 'phase', direction: -1 }, 0)).toThrow('first phase of Turn 1');
    for (const direction of [-1, 1] as const) {
      expect(() => room.command(spectator, { kind: 'phase', direction }, 0)).toThrow('Spectators');
    }
    expect(room.snapshot).toEqual(initial);
    room.accept(room.command(alice, { kind: 'phase' }, 0));
    expect(() => room.command(bob, { kind: 'phase', direction: -1 }, 0)).toThrow('table changed');
    expect(room.snapshot.phase).toBe(1);
  });

  test('projects the current phase from stored numeric state without activating the legacy shipment restriction', () => {
    const legacy = initialSnapshot();
    legacy.phase = 9;
    legacy.table.enforcement = 'strict';
    const room = new Room(gameSnapshotSchema.parse(JSON.parse(JSON.stringify(legacy))));
    expect(room.snapshot.table.phase).toBe('Harkonnen shipment');
    expect(tableForViewer(room.snapshot, alice.viewerSeat).phase).toBe('Storm');
    room.begin(alice, {
      carryId: 'free-move',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    const next = room.drop(alice, 'free-move', [0, 0.38, 0], 0);
    expect(next.table.pieces.find((piece) => piece.id === 'carry-free-move')?.zoneId).toBe('polar-sink');
    expect(next.phase).toBe(9);
    expect(() => gameSnapshotSchema.parse(next)).not.toThrow();
  });
});

describe('shared spice commands', () => {
  function spawn(room: Room, count: number, expectedRevision = room.snapshot.revision) {
    room.accept(room.command(alice, { kind: 'spice-spawn', count }, expectedRevision));
    return room.snapshot.table.pieces.filter(isSpicePiece).at(-1)!;
  }

  function begin(room: Room, sourcePieceId: string, carryId: string, pickup: 'top' | 'whole' = 'whole') {
    return room.begin(alice, {
      carryId,
      sourcePieceId,
      expectedVersion: room.snapshot.versions[sourcePieceId],
      pickup,
    });
  }

  test('seated players create public stacks that combine beyond the per-spawn limit', () => {
    const room = new Room(initialSnapshot());
    expect(() => room.command(spectator, { kind: 'spice-spawn', count: 10 }, 0)).toThrow('Spectators');
    const ten = spawn(room, 10);
    expect(room.snapshot.table.events[0].message).toBe('alice spawned 10 spice.');
    const two = spawn(room, 2, 0);
    const expectedItems = [...ten.items, ...two.items].map((item) => item.id).sort();
    begin(room, ten.id, 'combine');
    room.accept(room.drop(alice, 'combine', two.position, 0), 'combine');
    const combined = room.snapshot.table.pieces.filter(isSpicePiece);
    expect(combined).toHaveLength(1);
    expect(combined[0].items.map((item) => item.id).sort()).toEqual(expectedItems);
    expect(combined[0].items).toHaveLength(12);
    expect(room.snapshot.table.events[0].message).toBe('10 spice stacked with Spice.');
    expect(() => room.command(alice, { kind: 'spice-spawn', count: 1 }, room.snapshot.revision + 1)).toThrow(
      'table changed'
    );
  });

  test('returning a whole stack deletes it without affecting other pieces', () => {
    const room = new Room(initialSnapshot());
    const initial = structuredClone(room.snapshot.table.pieces);
    const spice = spawn(room, 10);
    begin(room, spice.id, 'return-whole');
    expect(() => room.drop(bob, 'return-whole', spiceSupplySlot().position, 0)).toThrow('carry has ended');
    expect(() =>
      room.begin(bob, {
        carryId: 'competing',
        sourcePieceId: spice.id,
        expectedVersion: room.snapshot.versions[spice.id],
        pickup: 'whole',
      })
    ).toThrow('Another player is carrying');
    room.accept(room.drop(alice, 'return-whole', spiceSupplySlot().position, 0), 'return-whole');
    expect(room.snapshot.table.pieces).toEqual(initial);
    expect(room.snapshot.versions).not.toHaveProperty(spice.id);
    expect(room.snapshot.table.events[0].message).toBe('alice returned 10 spice to the supply.');
    expect(room.publicCarries()).toEqual([]);
  });

  test.each(['top', 'whole'] as const)(
    'returning a %s carry removes only its items from every reserved donor',
    (pickup) => {
      const room = new Room(initialSnapshot());
      const first = spawn(room, pickup === 'top' ? 3 : 1);
      const second = spawn(room, 4);
      begin(room, first.id, 'two-donors', pickup);
      room.pose(alice, { carryId: 'two-donors', seq: 1, position: second.position, orientation: 0 });
      room.take(alice, { carryId: 'two-donors', requestId: 'take-one', donorPieceId: second.id });
      const before = room.snapshot;
      expect(() => room.command(bob, { kind: 'split', pieceId: second.id, count: 1 }, before.revision)).toThrow(
        'carrying'
      );
      room.accept(room.drop(alice, 'two-donors', spiceSupplySlot().position, 0), 'two-donors');
      expect(room.snapshot.table.pieces.find((piece) => piece.id === first.id)?.items).toEqual(
        pickup === 'top' ? first.items.slice(0, -1) : undefined
      );
      expect(room.snapshot.table.pieces.find((piece) => piece.id === second.id)?.items).toEqual(
        second.items.slice(0, -1)
      );
      expect(room.snapshot.table.events[0].message).toBe('alice returned 2 spice to the supply.');
      expect(room.reservations.size).toBe(0);
    }
  );

  test('dropping other pieces at the supply never deletes them', () => {
    const room = new Room(initialSnapshot());
    const before = items(room.snapshot);
    begin(room, 'harkonnen-force-stack', 'ordinary-piece');
    room.accept(room.drop(alice, 'ordinary-piece', spiceSupplySlot().position, 0), 'ordinary-piece');
    expect(items(room.snapshot)).toEqual(before);
    expect(room.snapshot.table.events[0].command).not.toBe('spice.return');
  });
});

describe('server-owned tabletop carries', () => {
  test('rejects stale source versions when reset reuses a retired split ID', () => {
    const room = new Room(initialSnapshot());
    const action = { kind: 'split', pieceId: 'harkonnen-force-stack', count: 1 } as const;
    const split = room.command(alice, action, room.snapshot.revision);
    const piece = split.table.pieces.find((candidate) => !Object.hasOwn(room.snapshot.versions, candidate.id));
    expect(piece).toBeDefined();
    const sourcePieceId = piece!.id;
    const expectedVersion = split.versions[sourcePieceId];
    room.accept(split);

    room.accept(room.command(alice, { kind: 'reset' }, room.snapshot.revision), undefined, true);
    expect(room.snapshot.versions).not.toHaveProperty(sourcePieceId);
    room.accept(room.command(alice, action, room.snapshot.revision));
    expect(room.snapshot.table.pieces.some((candidate) => candidate.id === sourcePieceId)).toBe(true);
    expect(room.snapshot.versions[sourcePieceId]).toBeGreaterThan(expectedVersion);
    expect(() =>
      room.begin(alice, { carryId: 'delayed-begin', sourcePieceId, expectedVersion, pickup: 'whole' })
    ).toThrow('That piece changed');
    expect(
      room.begin(alice, {
        carryId: 'fresh-begin',
        sourcePieceId,
        expectedVersion: room.snapshot.versions[sourcePieceId],
        pickup: 'whole',
      }).pieceId
    ).toBe(sourcePieceId);
  });

  test('bounds carry replay history per connection until disconnect, without evicting old IDs', () => {
    const room = new Room(initialSnapshot());
    const begin = (carryId: string) =>
      room.begin(alice, {
        carryId,
        sourcePieceId: 'harkonnen-force-stack',
        expectedVersion: 0,
        pickup: 'top',
      });
    for (let index = 0; index < 1024; index += 1) {
      const id = `carry-${index}`;
      begin(id);
      room.cancel(alice, id);
    }
    expect(() => begin('carry-0')).toThrow('That carry ID has ended');
    expect(() => begin('over-limit')).toThrow('Reconnect');
    expect(room.carries.size).toBe(0);
    expect(room.reservations.size).toBe(0);

    room.begin(bob, {
      carryId: 'bob-carry',
      sourcePieceId: 'atreides-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    room.clearActivity(alice.connectionId);
    expect(() => begin('carry-0')).toThrow('That carry ID has ended');
    expect(() => begin('over-limit')).toThrow('Reconnect');
    room.disconnect(alice.connectionId);
    // The transport has retired the old connection; its history is now releasable.
    expect(() => begin('carry-0')).not.toThrow();
    expect(room.carries.has('bob-carry')).toBe(true);
  });

  test('reserves a source once and keeps both its canonical contents and pose unchanged', () => {
    const room = new Room(initialSnapshot());
    const before = structuredClone(room.snapshot);
    room.begin(alice, {
      carryId: 'carry-a',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    expect(() =>
      room.begin(bob, {
        carryId: 'carry-b',
        sourcePieceId: 'harkonnen-force-stack',
        expectedVersion: 0,
        pickup: 'whole',
      })
    ).toThrow('Another player');
    expect(() => room.command(bob, { kind: 'flip', pieceId: 'harkonnen-force-stack' }, 0)).toThrow('Another player');
    room.pose(alice, { carryId: 'carry-a', seq: 1, position: [0, 0.38, 0], orientation: 0 });
    expect(room.snapshot).toEqual(before);
    expect(room.publicCarries()[0]?.withdrawnCounts).toEqual({ 'harkonnen-force-stack': 1 });
    room.cancel(alice, 'carry-a');
    expect(room.publicCarries()).toEqual([]);
    expect(room.reservations.size).toBe(0);
    expect(room.snapshot).toEqual(before);
  });

  test('moves a whole stack by the same identity and subtracts its whole source', () => {
    const room = new Room(initialSnapshot());
    room.begin(alice, {
      carryId: 'whole',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'whole',
    });
    room.pose(alice, { carryId: 'whole', seq: 3, position: [0, 0.38, 0], orientation: 0.1 });
    expect(room.pose(alice, { carryId: 'whole', seq: 2, position: [1, 0.38, 1], orientation: 0 })).toBe(false);
    const carry = room.publicCarries()[0];
    expect(carry?.held.id).toBe('harkonnen-force-stack');
    expect(carry?.held.position).toEqual([0, 0.38, 0]);
    expect(carry?.withdrawnCounts['harkonnen-force-stack']).toBe(5);
    const next = room.drop(alice, 'whole', [0, 0.38, 0], 0.1);
    expect(items(next)).toEqual(items(room.snapshot));
    expect(next.versions['harkonnen-force-stack']).toBe(1);
    room.accept(next, 'whole');
    expect(room.carries.size).toBe(0);
  });

  test('takes all cards while preserving order, deduplicates takes, and can leave an empty donor', () => {
    const room = new Room(initialSnapshot());
    const before = structuredClone(room.snapshot);
    const draft = room.begin(alice, {
      carryId: 'cards',
      sourcePieceId: 'treachery-deck',
      expectedVersion: 0,
      pickup: 'top',
    });
    expect(draft.pieceId).toBe('carry-cards');
    expect(draft.pieceId).not.toContain('treachery-4');
    room.pose(alice, { carryId: 'cards', seq: 1, position: [4.15, 0.38, -1.25], orientation: -0.08 });
    room.take(alice, { carryId: 'cards', requestId: 'take-1', donorPieceId: 'treachery-deck' });
    room.take(alice, { carryId: 'cards', requestId: 'take-1', donorPieceId: 'treachery-deck' });
    room.take(alice, { carryId: 'cards', requestId: 'take-2', donorPieceId: 'treachery-deck' });
    room.take(alice, { carryId: 'cards', requestId: 'take-3', donorPieceId: 'treachery-deck' });
    const carried = room.publicCarries()[0];
    expect(carried?.held.items.map((item) => item.id)).toEqual([
      'treachery-1',
      'treachery-2',
      'treachery-3',
      'treachery-4',
    ]);
    expect(carried?.withdrawnCounts['treachery-deck']).toBe(4);
    expect(room.snapshot).toEqual(before);
    const next = room.drop(alice, 'cards', [0, 0.38, 0], 0);
    expect(next.table.pieces.some((piece) => piece.id === 'treachery-deck')).toBe(false);
    expect(items(next)).toEqual(items(before));
  });

  test('reserves additional donors without duplicating the initial singleton', () => {
    const room = new Room(initialSnapshot());
    const before = items(room.snapshot);
    room.begin(alice, { carryId: 'packet', sourcePieceId: 'treachery-card-loose', expectedVersion: 0, pickup: 'top' });
    room.pose(alice, { carryId: 'packet', seq: 1, position: [4.15, 0.38, -1.25], orientation: 0 });
    room.take(alice, { carryId: 'packet', requestId: 'take', donorPieceId: 'treachery-deck' });
    expect(room.publicCarries()[0]?.withdrawnCounts).toEqual({ 'treachery-deck': 1, 'treachery-card-loose': 1 });
    expect(() =>
      room.begin(bob, { carryId: 'competing', sourcePieceId: 'treachery-deck', expectedVersion: 0, pickup: 'top' })
    ).toThrow('Another player');
    const next = room.drop(alice, 'packet', [0, 0.38, 0], 0);
    expect(items(next)).toEqual(before);
    expect(next.table.pieces.find((piece) => piece.id === 'treachery-card-loose')?.items).toHaveLength(2);
  });

  test('separate carries survive unrelated commits and phase changes, with ownership and leases intact', () => {
    const room = new Room(initialSnapshot());
    room.begin(
      alice,
      { carryId: 'a', sourcePieceId: 'harkonnen-force-stack', expectedVersion: 0, pickup: 'top' },
      1000
    );
    room.begin(bob, { carryId: 'b', sourcePieceId: 'atreides-force-stack', expectedVersion: 0, pickup: 'top' }, 1000);
    room.accept(room.drop(alice, 'a', [0, 0.38, 0], 0), 'a');
    expect(room.publicCarries().map((carry) => carry.id)).toEqual(['b']);
    expect(room.snapshot.table.pieces.find((piece) => piece.id === 'atreides-force-stack')?.locked).toBe(false);
    const before = room.publicCarries();
    const next = room.command(alice, { kind: 'phase' }, 1);
    room.accept(next);
    expect(room.publicCarries()).toEqual(before);
    room.accept(room.command(bob, { kind: 'phase', direction: -1 }, 2));
    expect(room.publicCarries()).toEqual(before);
    expect(() => room.drop(alice, 'b', [1, 0.38, 0], 0)).toThrow('carry has ended');
    expect(() => room.command(alice, { kind: 'flip', pieceId: 'atreides-force-stack' }, 3)).toThrow('Another player');
    const dropped = room.drop(bob, 'b', [1, 0.38, 0], 0);
    room.accept(dropped, 'b');
    expect(room.carries.size).toBe(0);
    expect(room.reservations.size).toBe(0);
    expect(next.phase).toBe(1);
  });

  test('enforces roles, revisions, owners and lease expiry', () => {
    const room = new Room(initialSnapshot());
    expect(() =>
      room.begin(spectator, {
        carryId: 'spectator',
        sourcePieceId: 'treachery-deck',
        expectedVersion: 0,
        pickup: 'top',
      })
    ).toThrow('Spectators');
    expect(() => room.pointer(spectator, [0, 0, 0])).toThrow('Spectators');
    room.accept(room.command(alice, { kind: 'enforcement', policy: 'strict' }, 0), undefined, true);
    expect(() =>
      room.begin(bob, {
        carryId: 'wrong-seat',
        sourcePieceId: 'harkonnen-force-stack',
        expectedVersion: 0,
        pickup: 'top',
      })
    ).toThrow('Another seat');
    expect(() => room.command(bob, { kind: 'storm', direction: 1 }, 0)).toThrow('table changed');
    room.begin(
      bob,
      { carryId: 'owned', sourcePieceId: 'atreides-force-stack', expectedVersion: 0, pickup: 'top' },
      1000
    );
    expect(() => room.drop(alice, 'owned', [0, 0.38, 0], 0)).toThrow('carry has ended');
    room.renew(bob, 'owned', 7000);
    expect(room.publicCarries()[0]?.expiresAt).toBe(15_000);
    room.sweep(9001);
    expect(room.carries.size).toBe(1);
    room.sweep(15_001);
    expect(room.carries.size).toBe(0);
    expect(room.reservations.size).toBe(0);
  });

  test('command mutations conserve items and phase patches reproduce boundary state', () => {
    const room = new Room(initialSnapshot());
    const initial = structuredClone(room.snapshot);
    const expectedItems = items(initial);
    for (const action of [
      { kind: 'split', pieceId: 'harkonnen-force-stack', count: 2 },
      { kind: 'flip', pieceId: 'treachery-deck' },
      { kind: 'rotate', pieceId: 'treachery-card-loose', direction: 1 },
      { kind: 'lock', pieceId: 'treachery-card-loose' },
      { kind: 'storm', direction: 1 },
      { kind: 'phase' },
    ] as const) {
      room.accept(room.command(alice, action, room.snapshot.revision));
      expect(items(room.snapshot)).toEqual(expectedItems);
    }
    expect(applyPatch(initial, diff(initial, room.snapshot))).toEqual(room.snapshot);
  });

  test('rejects a repeated flip during animation without blocking other pieces', () => {
    const room = new Room(initialSnapshot());
    room.accept(room.command(alice, { kind: 'flip', pieceId: 'treachery-deck' }, 0, 1000), undefined, false, 1000);
    expect(() => room.command(alice, { kind: 'flip', pieceId: 'treachery-deck' }, 1, 1100)).toThrow('finish flipping');
    expect(room.command(alice, { kind: 'flip', pieceId: 'treachery-card-loose' }, 1, 1100).revision).toBe(2);
    expect(room.command(alice, { kind: 'flip', pieceId: 'treachery-deck' }, 1, 1520).revision).toBe(2);
  });

  test('projects pointer identity without connection bookkeeping', () => {
    const room = new Room(initialSnapshot());
    const connection = { ...alice, pointerSeq: 7, tokens: 99, refilledAt: 1000 };
    room.pointer(connection, [0, 0.38, 0], 1000);
    expect(room.pointers.get(alice.connectionId)).toEqual({
      connectionId: alice.connectionId,
      viewerSeat: alice.viewerSeat,
      displayName: alice.displayName,
      color: alice.color,
      position: [0, 0.38, 0],
      updatedAt: 1000,
    });
  });
});
