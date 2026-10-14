import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RemovalVote, RemovalAction } from '../../src/shared/play/removal';
import { removalVoteSchema } from '../../src/shared/play/removal';
import { draftingRuntime } from './native-drafting.fixture.ts';
import type { NativeMessage } from './native-runtime.fixture.ts';
import type { NativeConnection } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  accepted,
  admitPlayer,
  eventually,
  seat,
  sendCommand,
  storedEventMessages,
  syncView,
} from './native-runtime.fixture.ts';

describe('Public removal votes', { timeout: 20_000 }, () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime([['emperor', 'Emperor']]));
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix: string) => admitPlayer(peer, runtime, suffix);
  async function players(count: number) {
    const result = [];
    for (let index = 0; index < count; index++) {
      const player = await admit(String.fromCharCode(97 + index));
      if (index) {
        await seat(player, result[0]);
      }
      result.push(player);
    }
    return result;
  }
  async function start(player: NativeConnection, target: NativeConnection) {
    const targetSeat = (await syncView(target)).viewer.viewerSeat;
    return required(
      required(
        required(await accepted(player, { kind: 'removal-start', seat: targetSeat })).snapshot.removalVotes
      ).find((vote) => vote.target.seat === targetSeat)
    );
  }
  /** The retained vote results, newest first, as the Audit log carries them. */
  async function history(player: NativeConnection) {
    const offset = player.messages.length;
    player.send({ type: 'log-history', tab: 'audit', before: Number.MAX_SAFE_INTEGER });
    const page = await eventually(
      () =>
        player.messages
          .slice(offset)
          .find(
            (message): message is Extract<NativeMessage, { type: 'log-history' }> =>
              message.type === 'log-history' && message.tab === 'audit'
          ),
      'fresh audit log'
    );
    return page.entries.filter((entry) => entry.class === 'vote');
  }
  /** The names a retained breakdown lists for one choice. */
  function voters(text: string, choice: string | null) {
    const match = new RegExp(`(?:: |; )([^;:]+?) ${choice === null ? 'did not vote' : `voted ${choice}`}`).exec(text);
    return match ? match[1].split(/, | and /) : [];
  }
  const ballot = (
    player: NativeConnection,
    vote: RemovalVote,
    choice: Extract<RemovalAction, { kind: 'removal-ballot' }>['choice']
  ) => accepted(player, { kind: 'removal-ballot', voteId: vote.id, choice });

  /* The smallest table, an even count that rounds the majority up, and a full table. */
  it.each([
    [3, 2],
    [4, 3],
    [18, 10],
  ])('requires %i players to supply %i approvals, including offline voters', async (count, threshold) => {
    const all = await players(count);
    const target = required(all.at(-1));
    const vote = await start(all[0], target);
    expect(required(vote).threshold).toBe(threshold);
    all[1].socket.close();
    expect(required(required(await syncView(all[0])).snapshot.removalVotes)[0].threshold).toBe(threshold);
    all[1] = await admit('b');
    for (let index = 1; index < threshold; index++) {
      const next = await ballot(all[index], vote, 'remove');
      expect(next.snapshot.removalVotes).toHaveLength(index + 1 === threshold ? 0 : 1);
    }
    expect((await syncView(target)).viewer.viewerSeat).toBe('neutral');
    const [result] = await history(target);
    expect(result.text).toMatch(/^Synthetic \w+ is removed from seat \d+: /);
    expect(voters(result.text, 'remove')).toHaveLength(threshold);
    expect(
      await runtime.exec<{ cause: string }>("SELECT cause FROM seat_history WHERE user_id=? AND event='vacated'", [
        `user-${String.fromCharCode(96 + count)}`,
      ])
    ).toEqual([{ cause: 'removal' }]);
    expect(
      (await storedEventMessages(runtime)).filter((message: string | string[]) => message.includes('Synthetic'))
    ).toEqual([]);
  });

  it('refuses two-player removal and spectators or targets voting, and resolves impossibility after changed ballots', async () => {
    const [a, b] = await players(2);
    expect((await sendCommand(a, { kind: 'removal-start', seat: 'seat-2' })).reply.type).toBe('rejected');
    const c = await admit('c');
    await seat(c, a);
    const d = await admit('d');
    await seat(d, a);
    const vote = await start(a, d);
    const observer = await admit('observer');
    expect((await sendCommand(observer, { kind: 'removal-start', seat: 'seat-4' })).reply.type).toBe('rejected');
    for (const invalid of [d, observer]) {
      expect(
        (await sendCommand(invalid, { kind: 'removal-ballot', voteId: required(vote).id, choice: 'remove' })).reply.type
      ).toBe('rejected');
    }
    await ballot(a, vote, null);
    expect(
      required(required(await syncView(b)).snapshot.removalVotes)[0].ballots.every((entry) => entry.choice === null)
    ).toBe(true);
    await accepted(b, { kind: 'removal-start', seat: 'seat-4' });
    expect(
      required(required(await syncView(b)).snapshot.removalVotes)[0].ballots.every((entry) => entry.choice === null)
    ).toBe(true);
    await ballot(a, vote, 'remove');
    const ended = await ballot(b, vote, 'keep');
    expect(ended.snapshot.removalVotes).toEqual([]);
    expect((await history(observer))[0].text).toMatch(/^Synthetic D keeps seat 4: /);
    expect(
      (await sendCommand(c, { kind: 'removal-ballot', voteId: required(vote).id, choice: 'remove' })).reply.type
    ).toBe('rejected');
  });

  it('reevaluates concurrent targets after membership changes and gives a returning player no inherited ballot', async () => {
    const [a, b, c, d, e, f] = await players(6);
    const one = await start(a, f);
    const two = await start(b, e);
    await ballot(c, one, 'remove');
    await accepted(c, { kind: 'seat-depart' });
    let view = (await syncView(a)).snapshot;
    expect(view.removalVotes).toHaveLength(2);
    expect(required(view.removalVotes)[0].ballots.filter((entry) => entry.choice === 'remove')).toHaveLength(1);
    await seat(c, a);
    view = (await syncView(a)).snapshot;
    expect(
      required(required(required(view).removalVotes)[0].ballots.find((entry) => entry.name === 'Synthetic C')).choice
    ).toBeNull();
    await accepted(f, { kind: 'seat-depart' });
    expect(required(required(await syncView(a)).snapshot.removalVotes).map((vote) => vote.id)).toEqual([
      required(two).id,
    ]);
    expect(
      required((await history(a)).find((entry) => entry.text.startsWith('The vote about Synthetic F'))).text
    ).toMatch(/ended without a result when they left seat 6\.$/);
    await seat(f, a);
    expect(
      (await sendCommand(f, { kind: 'removal-ballot', voteId: required(one).id, choice: 'keep' })).reply.type
    ).toBe('rejected');
    await ballot(a, two, 'remove');
    await ballot(c, two, 'remove');
    await ballot(d, two, 'remove');
    expect((await syncView(e)).viewer.viewerSeat).toBe('neutral');
  });

  it('follows its target through a swap and preserves receipts, rollback, directory updates and cold restore', async () => {
    const [a, b, c] = await players(3);
    for (const player of [a, b, c]) {
      await accepted(player, { kind: 'draft-ready', ready: true });
    }
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    const vote = await start(a, b);
    const trade = async (player: NativeConnection, target: string) => {
      const view = await syncView(player);
      return accepted(player, {
        kind: 'swap-offer',
        target,
        seat: view.viewer.viewerSeat,
        round: required(view.snapshot.swapping).round,
      });
    };
    await trade(b, 'seat-3');
    await trade(c, 'seat-2');
    const moved = required(required(await syncView(a)).snapshot.removalVotes)[0];
    expect(moved.id).toBe(required(vote).id);
    expect(moved.openedAt).toBe(required(vote).openedAt);
    expect(moved.target.seat).toBe('seat-3');
    await runtime.exec(
      "CREATE TRIGGER refuse_vote BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'receipt failure'); END"
    );
    expect(
      (await sendCommand(c, { kind: 'removal-ballot', voteId: required(vote).id, choice: 'remove' })).reply.type
    ).toBe('rejected');
    expect((await syncView(b)).viewer.viewerSeat).toBe('seat-3');
    expect(await history(a)).toEqual([]);
    await runtime.exec('DROP TRIGGER refuse_vote');
    const committed = await sendCommand(
      c,
      { kind: 'removal-ballot', voteId: required(vote).id, choice: 'remove' },
      'remove-once'
    );
    expect(committed.reply.type).not.toBe('rejected');
    c.send(committed.message);
    await syncView(c);
    expect(await history(a)).toHaveLength(1);
    expect((await syncView(b)).viewer.viewerSeat).toBe('neutral');
    expect((await syncView(c)).viewer.viewerSeat).toBe('seat-2');
    await eventually(() => peer.summaries.some((entry) => entry.summary.seats.length === 2), 'removed directory seat');
    await runtime.restart();
    const restored = await admit('a');
    expect((await syncView(restored)).snapshot.removalVotes).toEqual([]);
    expect((await history(restored))[0].text).toMatch(/^Synthetic B is removed from seat 3: /);
  });

  it('retains the final seats when a target departs after swapping', async () => {
    const [a, b, c] = await players(3);
    for (const player of [a, b, c]) {
      await accepted(player, { kind: 'draft-ready', ready: true });
    }
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    const vote = await start(a, b);
    for (const [player, target] of [
      [b, 'seat-3'],
      [c, 'seat-2'],
    ] as const) {
      const view = await syncView(player);
      await accepted(player, {
        kind: 'swap-offer',
        target,
        seat: view.viewer.viewerSeat,
        round: required(view.snapshot.swapping).round,
      });
    }
    await accepted(b, { kind: 'seat-depart' });
    const result = required((await history(a)).find((entry) => entry.text.startsWith('The vote about Synthetic B')));
    expect(result.text).toBe('The vote about Synthetic B ended without a result when they left seat 3.');
    expect(result.context).toBe('Swapping');
    const retained = removalVoteSchema.parse(
      JSON.parse(
        (await runtime.exec<{ data: string }>('SELECT data FROM removal_votes WHERE vote_id=?', [required(vote).id]))[0]
          .data
      )
    );
    expect(retained.target.seat).toBe('seat-3');
    expect(required(retained.ballots.find((entry) => entry.name === 'Synthetic C')).seat).toBe('seat-2');
  });

  it('scrubs deleted identities from retained breakdowns while nullifying their open target vote', async () => {
    const [a, b, c, d] = await players(4);
    const failed = await start(a, d);
    await ballot(b, failed, 'keep');
    await start(b, d);
    const deleted = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId: 'user-d',
        eventId: 'delete-d',
        deletionOperationId: 'operation-d',
      }),
    });
    expect(deleted.status).toBe(200);
    const results = await history(a);
    expect(results.map((entry) => entry.text)).toEqual([
      'The vote about [deleted user] ended without a result when they left seat 4.',
      '[deleted user] keeps seat 4: Synthetic A voted remove; Synthetic B voted keep; Synthetic C did not vote.',
    ]);
    expect(JSON.stringify(results)).not.toMatch(/Synthetic D|user-d|userId/);
    expect((await syncView(c)).snapshot.removalVotes).toEqual([]);
    await runtime.restart();
    expect(await history(await admit('a'))).toEqual(results);
  });
});
