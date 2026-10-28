import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vite-plus/test';

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
    pieceHandles: {},
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
  it('retains report disclosure, deduplicates it, links the issue and scrubs a deleted reporter', () => {
    const log = new PublicLog(memoryStorage(), () => 'Turn 1');
    log.enabled = true;
    const request = {
      key: 'bug-report:one:requested',
      class: 'bug-report' as const,
      template: '{0} requested a full game state export, including hidden information.',
      people: [{ userId: 'reporter-id', name: 'Reporter' }],
    };
    log.record(request);
    log.record(request);
    log.record({
      key: 'bug-report:one:complete',
      class: 'bug-report',
      template: 'Full game state published: https://github.com/ndelangen/dunezone/issues/42',
    });
    log.scrub('reporter-id');
    const entries = log.page('game', Number.MAX_SAFE_INTEGER).entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]?.issueUrl).toBe('https://github.com/ndelangen/dunezone/issues/42');
    expect(entries[1]?.text).toContain('[deleted user]');
    expect(log.page('audit', Number.MAX_SAFE_INTEGER).entries).toHaveLength(0);
  });
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

  it('records an alliance forming and breaking, and nothing for an offer', () => {
    const log = new PublicLog(memoryStorage(), () => 'Turn 1');
    log.enabled = true;
    const roster = {
      seats: [
        { id: 'seat-1', faction: { id: 'house', name: 'House' } },
        { id: 'seat-2', faction: { id: 'fremen', name: 'Fremen' } },
        { id: 'seat-3', faction: { id: 'guild', name: 'Guild' } },
      ],
    };
    const at = (revision: number, groups: string[][]) =>
      snapshot(revision, {
        roster,
        alliances: { groups: groups.map((members) => ({ members, mark: 0 })), offers: [] },
      } as never);
    const command = (action: object) => ({ type: 'command', action }) as never;
    log.recordCommit({
      holders: [],
      before: at(1, []),
      next: at(2, []),
      message: command({ kind: 'alliance-offer', factionId: 'fremen' }),
      viewer: viewer as never,
    });
    log.recordCommit({
      holders: [],
      before: at(2, []),
      next: at(3, [['house', 'fremen']]),
      message: command({ kind: 'alliance-accept', factionId: 'house', offer: 0 }),
      viewer: viewer as never,
    });
    log.recordCommit({
      holders: [],
      before: at(3, [['house', 'fremen']]),
      next: at(4, []),
      message: command({ kind: 'alliance-break', factionId: 'fremen' }),
      viewer: viewer as never,
    });
    expect(log.page('game', Number.MAX_SAFE_INTEGER).entries.map((entry) => entry.text)).toEqual([
      'House broke its alliance with Fremen.',
      'House and Fremen are now allied.',
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
            leaderIds: ['leader'],
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
      'Fremen {1} revealed its dial early: 4.5.',
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

  it('names who deleted a piece and what it showed, never a hidden face', () => {
    const log = new PublicLog(memoryStorage(), () => 'Turn 1');
    log.enabled = true;
    const card = (id: string, faceUp: boolean) => ({
      id,
      label: 'Treachery card',
      kind: 'card',
      items: [
        { id: `${id}-item`, faceUp, artwork: { back: 'https://x.test/b.png', name: 'Family Atomics', type: 't' } },
      ],
    });
    const table = (...pieces: unknown[]) => ({ table: { pieces } }) as never;
    const remove = (revision: number, pieceId: string, before: unknown[], after: unknown[]) =>
      log.recordCommit({
        holders: [],
        before: snapshot(revision, table(...before)),
        next: snapshot(revision + 1, table(...after)),
        message: { type: 'command', action: { kind: 'delete', pieceId } } as never,
        viewer: viewer as never,
      });
    remove(1, 'atomics', [card('atomics', true), card('hidden', false)], [card('hidden', false)]);
    remove(2, 'hidden', [card('hidden', false)], []);
    /* A card that passed through a hand is named on the wire by its public handle. */
    log.recordCommit({
      holders: [],
      before: snapshot(3, { table: { pieces: [card('handed', true)] }, pieceHandles: { handed: 'handle-7' } } as never),
      next: snapshot(4, table()),
      message: { type: 'command', action: { kind: 'delete', pieceId: 'handle-7' } } as never,
      viewer: viewer as never,
    });
    expect(log.page('game', Number.MAX_SAFE_INTEGER).entries.map((entry) => entry.text)).toEqual([
      'Alice deleted Family Atomics card from the game.',
      'Alice deleted Treachery card from the game.',
      'Alice deleted Family Atomics card from the game.',
    ]);
  });
});
