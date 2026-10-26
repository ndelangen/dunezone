import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { TableSeatCount } from '../../src/shared/play/tableSettings';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '../../src/shared/play/tableSettings';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  sendCommand,
  syncView,
} from './native-runtime.fixture.ts';
import type { Metadata } from './session';
import type { StoredSnapshot } from './state';

const FIXTURE_ROSTER = {
  seatCount: 6,
  seats: [
    { id: 'harkonnen', position: 0, faction: { id: 'harkonnen', name: 'Harkonnen', color: '#ed927c' } },
    { id: 'atreides', position: 1, faction: { id: 'atreides', name: 'Atreides', color: '#75d8a7' } },
  ],
};

describe('Seats, factions and stations through native delivery', () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    peer = await createPeer();
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The native fixture did not provision.');
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix: string) => admitPlayer(runtime, suffix);
  const sync = syncView;

  async function readJson(table: 'metadata'): Promise<Metadata>;
  async function readJson(table: 'current_state'): Promise<StoredSnapshot>;
  async function readJson(table: 'metadata' | 'current_state'): Promise<Metadata | StoredSnapshot> {
    const [row] = await runtime.exec<{ data: string }>(`SELECT data FROM ${table} WHERE id=1`);
    return JSON.parse(row.data) as Metadata | StoredSnapshot;
  }

  /** Rewrites the seating a room fixed, as public assignment will, then restarts so the room reads it cold. */
  async function reseat(seatCount: TableSeatCount, seats: NonNullable<StoredSnapshot['roster']>['seats']) {
    await runtime.exec('DELETE FROM seats');
    for (const seat of seats) {
      await runtime.exec(
        'INSERT INTO seats (seat, position, faction_id, faction_name, faction_color) VALUES(?,?,?,?,?)',
        [seat.id, seat.position, seat.faction?.id ?? null, seat.faction?.name ?? null, seat.faction?.color ?? null]
      );
    }
    await runtime.exec('UPDATE metadata SET data=? WHERE id=1', [
      JSON.stringify({ ...(await readJson('metadata')), seatCount }),
    ]);
    const snapshot = await readJson('current_state');
    delete snapshot.roster;
    const factions = seats.flatMap((seat) => (seat.faction ? [seat.faction.id] : []));
    snapshot.factionBanks = Object.fromEntries(factions.map((id: string, index: number) => [id, 10 + index]));
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
    await runtime.restart();
  }

  function house(position: number) {
    return {
      id: `seat-${position + 1}`,
      position,
      faction: { id: `house-${position + 1}`, name: `House ${position + 1}`, color: '#ffffff' },
    };
  }

  it('seats the fixture houses at the first two of six stations and admits later users as spectators', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const c = await admit('c');
    const view = await sync(a);
    expect(view.snapshot.roster).toEqual(FIXTURE_ROSTER);
    expect(view.viewer).toMatchObject({ viewerSeat: 'harkonnen', color: '#ed927c' });
    expect(view.snapshot.bank).toEqual({ factionId: 'harkonnen', balance: 0 });
    expect(required(view.snapshot.controls).seats).toEqual(['harkonnen', 'atreides']);
    expect((await sync(b)).viewer).toMatchObject({ viewerSeat: 'atreides', color: '#75d8a7' });
    expect((await sync(c)).viewer).toMatchObject({ viewerSeat: 'neutral', color: '#d0c8b9' });
    expect((await sync(c)).snapshot).not.toHaveProperty('bank');
  });

  it.each([2, 6, 18] as const)(
    'seats %s players at distinct stations, lands a withdrawal at its seat and keeps each projection through a restart',
    async (count) => {
      const seats = Array.from({ length: count }, (_, position) => house(position));
      await reseat(count, seats);
      const players = [];
      for (let index = 0; index < count; index++) {
        players.push(await admit(`p${index}`));
      }
      const spectator = await admit('z');
      const views = [];
      for (const player of players) {
        views.push(await sync(player));
      }
      expect(views.map((view) => view.viewer.viewerSeat)).toEqual(seats.map((seat) => seat.id));
      expect(views.map((view) => view.snapshot.bank)).toEqual(
        seats.map((seat, index) => ({ factionId: seat.faction.id, balance: 10 + index }))
      );
      expect(views[0].snapshot.roster).toEqual({ seatCount: count, seats });
      expect(required(required(views)[0].snapshot.controls).seats).toEqual(seats.map((seat) => seat.id));
      expect((await sync(spectator)).viewer.viewerSeat).toBe('neutral');

      const last = required(players.at(-1));
      expect((await sendCommand(last, { kind: 'bank-withdraw', amount: 1 })).reply.type).not.toBe('rejected');
      const stack = (await sync(last)).snapshot.table.pieces.at(-1);
      const angle = tableSeatAngles(count)[count - 1];
      const radius = PLAYER_RING_RADIUS - 0.55;
      const distance = Math.hypot(
        required(stack).position[0] - Math.cos(angle) * radius,
        required(stack).position[2] - Math.sin(angle) * radius
      );
      expect(distance).toBeLessThan(0.75);

      await runtime.restart();
      const restored = await sync(await admit(`p${count - 1}`));
      expect(restored.viewer.viewerSeat).toBe(required(required(seats).at(-1)).id);
      expect(restored.snapshot.bank).toEqual({
        factionId: required(required(seats).at(-1)).faction.id,
        balance: 10 + count - 2,
      });
      expect(restored.snapshot.roster).toEqual({ seatCount: count, seats });
    }
  );

  it('keeps two factions with the same display name apart by their identities', async () => {
    await reseat(2, [
      { id: 'seat-1', position: 0, faction: { id: 'house-a', name: 'Atreides', color: '#111111' } },
      { id: 'seat-2', position: 1, faction: { id: 'house-b', name: 'Atreides', color: '#222222' } },
    ]);
    const a = await sync(await admit('a'));
    const b = await sync(await admit('b'));
    expect(required(a.snapshot.roster).seats.map((seat) => required(seat.faction).name)).toEqual([
      'Atreides',
      'Atreides',
    ]);
    expect(a.snapshot.bank).toEqual({ factionId: 'house-a', balance: 10 });
    expect(b.snapshot.bank).toEqual({ factionId: 'house-b', balance: 11 });
    expect(a.viewer.color).toBe('#111111');
    expect(b.viewer.color).toBe('#222222');
    /* The seating is public; the other house's spice reserve is not. */
    expect(JSON.stringify(a)).not.toContain('factionBanks');
    expect(JSON.stringify(a)).not.toContain('"balance":11');
  });

  it('keeps a vacated seat with its faction and station for the next admitted player', async () => {
    const a = await admit('a');
    await admit('b');
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId: 'user-a',
        eventId: 'deletion-a',
        deletionOperationId: 'operation-a',
      }),
    });
    expect(response.status).toBe(200);
    await eventually(() => a.closed, 'deleted socket closed');
    const replacement = await sync(await admit('c'));
    expect(replacement.viewer).toMatchObject({ viewerSeat: 'harkonnen', color: '#ed927c' });
    expect(replacement.snapshot.bank).toEqual({ factionId: 'harkonnen', balance: 0 });
    expect(replacement.snapshot.roster).toEqual(FIXTURE_ROSTER);
    expect(required(replacement.snapshot.controls).seats.sort()).toEqual(['atreides', 'harkonnen']);
    await runtime.restart();
    expect((await sync(await admit('c'))).viewer.viewerSeat).toBe('harkonnen');
    expect((await sync(await admit('d'))).viewer.viewerSeat).toBe('neutral');
  });
});
