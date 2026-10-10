import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { PublicLog } from './log';
import type { StoredSnapshot } from './state';

/* The part of Durable Object storage the log uses, over an in-memory SQLite database. */
function memoryStorage() {
  const database = new DatabaseSync(':memory:');
  return {
    sql: {
      exec: (query: string, ...bindings: (string | number | null)[]) => {
        const statement = database.prepare(query);
        const rows = statement.columns().length ? statement.all(...bindings) : (statement.run(...bindings), []);
        return { toArray: () => rows };
      },
    },
  } as unknown as DurableObjectStorage;
}

const viewer = { userId: 'user-alice', displayName: 'Alice', connectionId: 'c', viewerSeat: 'seat-1', color: '#fff' };

/* A table in play whose two factions carry names a person could publish, braces included. */
function snapshot(revision: number, extra: Partial<StoredSnapshot> = {}) {
  return {
    stage: 'play',
    phase: 1,
    revision,
    battleResults: [],
    privatePredictions: {},
    roster: {
      seats: [
        { seat: 'seat-1', faction: { id: 'house', name: 'House {0}' } },
        { seat: 'seat-2', faction: { id: 'fremen', name: 'Fremen {1}' } },
      ],
    },
    ...extra,
  } as unknown as StoredSnapshot;
}

describe('the public log', () => {
  it('keeps the braces in a faction name instead of reading them as player slots', () => {
    const log = new PublicLog(memoryStorage(), () => 'Turn 1');
    log.enabled = true;
    const message = { type: 'command', action: { kind: 'battle-reveal' } } as never;
    log.recordCommit({
      holders: [],
      before: snapshot(1),
      next: snapshot(2, {
        battleResults: [{ id: 'b', revision: 2, outcome: 'left', factions: ['house', 'fremen'] }],
      } as never),
      message,
      viewer: viewer as never,
    });
    log.recordCommit({
      holders: [],
      before: snapshot(2),
      next: snapshot(3),
      message,
      viewer: viewer as never,
      transfer: { kind: 'withdrawal', amount: 3, source: 'fremen', revision: 3 } as never,
    });
    log.recordCommit({
      holders: [],
      before: snapshot(3),
      next: snapshot(4, {
        privatePredictions: {
          p: { factionId: 'house', lockedAt: 0, revealedAt: 1, choice: { factionId: 'fremen', turn: 3 } },
        },
      }),
      message: { type: 'command', action: { kind: 'prediction-reveal', stepId: 'p' } } as never,
      viewer: viewer as never,
    });
    const phases = [{ label: 'Storm {0}' }, { label: 'Spice {1}' }];
    log.recordCommit({
      holders: [],
      before: snapshot(4, { phase: 0, phases } as never),
      next: snapshot(5, { phase: 1, phases } as never),
      message: { type: 'command', action: { kind: 'phase', direction: 1 } } as never,
      viewer: viewer as never,
    });
    log.recordCommit({
      holders: [],
      before: snapshot(5),
      next: snapshot(6),
      message,
      viewer: viewer as never,
      transfer: { kind: 'supply', amount: 4, source: 'supply', destination: 'table', revision: 6 } as never,
    });
    log.recordCommit({
      holders: [],
      before: snapshot(6),
      next: snapshot(7),
      message,
      viewer: viewer as never,
      transfer: { kind: 'disposal', amount: 2, source: 'table', revision: 7 } as never,
    });
    expect(log.page('game', Number.MAX_SAFE_INTEGER).entries.map((entry) => entry.text)).toEqual([
      'Alice returned 2 spice to the Spice Bank.',
      'Alice took 4 spice from the Spice Bank to the table.',
      'Spice {1} began.',
      'House {0} revealed its prediction: Fremen {1}, turn 3.',
      'Alice withdrew 3 spice from the Fremen {1} spice reserve to the table.',
      'House {0} defeated Fremen {1}.',
    ]);
  });

  it('names each battle plan part a faction reveals early, as everyone now sees it', () => {
    const log = new PublicLog(memoryStorage(), () => 'Turn 1');
    log.enabled = true;
    const piece = (id: string, name: string) => ({ id, label: id, items: [{ id: `${id}-item`, artwork: { name } }] });
    const battle = (disclosed: { leader: boolean; dial: boolean; cardIds: string[] }) => ({
      battleState: {
        id: 'b',
        sides: [{ factionId: 'house' }, { factionId: 'fremen' }],
        plans: [
          null,
          {
            leaderId: 'leader',
            strength: 4.5,
            spice: 3,
            pieces: [piece('leader', 'Stilgar {0}'), piece('card', 'Crysknife')],
            disclosed,
          },
        ],
      },
    });
    const steps = [
      { leader: false, dial: false, cardIds: [] },
      { leader: false, dial: false, cardIds: ['card'] },
      { leader: true, dial: false, cardIds: ['card'] },
      { leader: true, dial: true, cardIds: ['card'] },
    ];
    steps.slice(1).forEach((disclosed, index) =>
      log.recordCommit({
        holders: [],
        before: snapshot(index + 1, battle(steps[index]!) as never),
        next: snapshot(index + 2, battle(disclosed) as never),
        message: { type: 'command', action: { kind: 'battle-disclose' } } as never,
        viewer: viewer as never,
      })
    );
    expect(log.page('game', Number.MAX_SAFE_INTEGER).entries.map((entry) => entry.text)).toEqual([
      'Fremen {1} revealed its dial early: troop strength 4.5, 3 spice.',
      'Fremen {1} revealed its leader early: Stilgar {0}.',
      'Fremen {1} revealed a card early: Crysknife.',
    ]);
  });

  it('names the player of a faction whose name another seat shares, and forgets them on deletion', () => {
    const log = new PublicLog(memoryStorage(), () => 'Turn 1');
    log.enabled = true;
    const twins = (revision: number, extra: Partial<StoredSnapshot> = {}) =>
      snapshot(revision, {
        roster: {
          seats: [
            { id: 'seat-1', faction: { id: 'h1', name: 'Harkonnen' } },
            { id: 'seat-2', faction: { id: 'h2', name: 'Harkonnen' } },
            { id: 'seat-3', faction: { id: 'a', name: 'Atreides' } },
          ],
        },
        ...extra,
      } as never);
    log.recordCommit({
      holders: [
        { seat: 'seat-1', userId: 'user-alice', name: 'Alice' },
        { seat: 'seat-3', userId: 'user-carol', name: 'Carol' },
      ],
      before: twins(1),
      next: twins(2, {
        battleResults: [{ id: 'b', revision: 2, outcome: 'right', factions: ['a', 'h2'] }],
      } as never),
      message: { type: 'command', action: { kind: 'battle-reveal' } } as never,
      viewer: viewer as never,
    });
    log.recordCommit({
      holders: [
        { seat: 'seat-1', userId: 'user-alice', name: 'Alice' },
        { seat: 'seat-2', userId: 'user-bob', name: 'Bob' },
      ],
      before: twins(2),
      next: twins(3),
      message: { type: 'command', action: { kind: 'battle-reveal' } } as never,
      viewer: viewer as never,
      transfer: { kind: 'collection', amount: 2, destination: 'h1', revision: 3 } as never,
    });
    const texts = () => log.page('game', Number.MAX_SAFE_INTEGER).entries.map((entry) => entry.text);
    expect(texts()).toEqual([
      'Alice collected 2 spice from the table into the Harkonnen (Alice) spice reserve.',
      'Harkonnen (seat 2) defeated Atreides.',
    ]);
    log.scrub('user-alice');
    expect(texts()).toEqual([
      '[deleted user] collected 2 spice from the table into the Harkonnen (seat 1) spice reserve.',
      'Harkonnen (seat 2) defeated Atreides.',
    ]);
  });
});
