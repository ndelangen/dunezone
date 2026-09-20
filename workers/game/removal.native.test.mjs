import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { draftingRuntime } from './native-drafting.fixture.mjs';
import { admitPlayer, eventually, sendCommand, syncView } from './native-runtime.fixture.mjs';

describe('Public removal votes', () => {
  let peer, runtime;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime([['emperor', 'Emperor']]));
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  async function accepted(connection, action, id) {
    const sent = await sendCommand(connection, action, id);
    expect(sent.reply.type, JSON.stringify(sent.reply)).not.toBe('rejected');
    return (await syncView(connection)).snapshot;
  }
  async function seat(player, approver, target) {
    const next = await accepted(player, { kind: 'seat-request', ...(target ? { seat: target } : {}) });
    await accepted(approver, {
      kind: 'seat-approve',
      requestId: next.controls.seatRequests.find((request) => request.own).id,
    });
  }
  async function players(count) {
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
  async function start(player, target) {
    const seat = (await syncView(target)).viewer.viewerSeat;
    return (await accepted(player, { kind: 'removal-start', seat })).removalVotes.find(
      (vote) => vote.target.seat === seat
    );
  }
  /** The retained vote results, newest first, as the Audit log carries them. */
  async function history(player) {
    const offset = player.messages.length;
    player.send({ type: 'log-history', tab: 'audit', before: Number.MAX_SAFE_INTEGER });
    const page = await eventually(
      () => player.messages.slice(offset).find((message) => message.type === 'log-history' && message.tab === 'audit'),
      'fresh audit log'
    );
    return page.entries.filter((entry) => entry.class === 'vote');
  }
  /** The names a retained breakdown lists for one choice. */
  function voters(text, choice) {
    const match = new RegExp(`(?:: |; )([^;:]+?) ${choice === null ? 'did not vote' : `voted ${choice}`}`).exec(text);
    return match ? match[1].split(/, | and /) : [];
  }
  const ballot = (player, vote, choice) => accepted(player, { kind: 'removal-ballot', voteId: vote.id, choice });

  it.each([
    [3, 2],
    [4, 3],
    [6, 4],
    [18, 10],
  ])('requires %i players to supply %i approvals, including offline voters', async (count, threshold) => {
    const all = await players(count);
    const target = all.at(-1);
    const vote = await start(all[0], target);
    expect(vote.threshold).toBe(threshold);
    all[1].socket.close();
    expect((await syncView(all[0])).snapshot.removalVotes[0].threshold).toBe(threshold);
    all[1] = await admit('b');
    for (let index = 1; index < threshold; index++) {
      const next = await ballot(all[index], vote, 'remove');
      expect(next.removalVotes).toHaveLength(index + 1 === threshold ? 0 : 1);
    }
    expect((await syncView(target)).viewer.viewerSeat).toBe('neutral');
    const [result] = await history(target);
    expect(result.text).toMatch(/^Synthetic \w+ is removed from seat \d+: /);
    expect(voters(result.text, 'remove')).toHaveLength(threshold);
    expect(
      await runtime.exec("SELECT cause FROM seat_history WHERE user_id=? AND event='vacated'", [
        `user-${String.fromCharCode(96 + count)}`,
      ])
    ).toEqual([{ cause: 'removal' }]);
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
        (await sendCommand(invalid, { kind: 'removal-ballot', voteId: vote.id, choice: 'remove' })).reply.type
      ).toBe('rejected');
    }
    await ballot(a, vote, null);
    expect((await syncView(b)).snapshot.removalVotes[0].ballots.every((entry) => entry.choice === null)).toBe(true);
    await accepted(b, { kind: 'removal-start', seat: 'seat-4' });
    expect((await syncView(b)).snapshot.removalVotes[0].ballots.every((entry) => entry.choice === null)).toBe(true);
    await ballot(a, vote, 'remove');
    const ended = await ballot(b, vote, 'keep');
    expect(ended.removalVotes).toEqual([]);
    expect((await history(observer))[0].text).toMatch(/^Synthetic D keeps seat 4: /);
    expect((await sendCommand(c, { kind: 'removal-ballot', voteId: vote.id, choice: 'remove' })).reply.type).toBe(
      'rejected'
    );
  });

  it('reevaluates concurrent targets after membership changes and gives a returning player no inherited ballot', async () => {
    const [a, b, c, d, e, f] = await players(6);
    const one = await start(a, f);
    const two = await start(b, e);
    await ballot(c, one, 'remove');
    await accepted(c, { kind: 'seat-depart' });
    let view = (await syncView(a)).snapshot;
    expect(view.removalVotes).toHaveLength(2);
    expect(view.removalVotes[0].ballots.filter((entry) => entry.choice === 'remove')).toHaveLength(1);
    await seat(c, a);
    view = (await syncView(a)).snapshot;
    expect(view.removalVotes[0].ballots.find((entry) => entry.name === 'Synthetic C').choice).toBeNull();
    await accepted(f, { kind: 'seat-depart' });
    expect((await syncView(a)).snapshot.removalVotes.map((vote) => vote.id)).toEqual([two.id]);
    expect((await history(a)).find((entry) => entry.text.startsWith('The vote about Synthetic F')).text).toMatch(
      /ended without a result when they left seat 6\.$/
    );
    await seat(f, a);
    expect((await sendCommand(f, { kind: 'removal-ballot', voteId: one.id, choice: 'keep' })).reply.type).toBe(
      'rejected'
    );
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
    const trade = async (player, target) => {
      const view = await syncView(player);
      return accepted(player, {
        kind: 'swap-offer',
        target,
        seat: view.viewer.viewerSeat,
        round: view.snapshot.swapping.round,
      });
    };
    await trade(b, 'seat-3');
    await trade(c, 'seat-2');
    const moved = (await syncView(a)).snapshot.removalVotes[0];
    expect(moved.id).toBe(vote.id);
    expect(moved.openedAt).toBe(vote.openedAt);
    expect(moved.target.seat).toBe('seat-3');
    await runtime.exec(
      "CREATE TRIGGER refuse_vote BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'receipt failure'); END"
    );
    expect((await sendCommand(c, { kind: 'removal-ballot', voteId: vote.id, choice: 'remove' })).reply.type).toBe(
      'rejected'
    );
    expect((await syncView(b)).viewer.viewerSeat).toBe('seat-3');
    expect(await history(a)).toEqual([]);
    await runtime.exec('DROP TRIGGER refuse_vote');
    const committed = await sendCommand(
      c,
      { kind: 'removal-ballot', voteId: vote.id, choice: 'remove' },
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
    ]) {
      const view = await syncView(player);
      await accepted(player, {
        kind: 'swap-offer',
        target,
        seat: view.viewer.viewerSeat,
        round: view.snapshot.swapping.round,
      });
    }
    await accepted(b, { kind: 'seat-depart' });
    const result = (await history(a)).find((entry) => entry.text.startsWith('The vote about Synthetic B'));
    expect(result.text).toBe('The vote about Synthetic B ended without a result when they left seat 3.');
    expect(result.context).toBe('Swapping');
    const retained = JSON.parse(
      (await runtime.exec('SELECT data FROM removal_votes WHERE vote_id=?', [vote.id]))[0].data
    );
    expect(retained.target.seat).toBe('seat-3');
    expect(retained.ballots.find((entry) => entry.name === 'Synthetic C').seat).toBe('seat-2');
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
