import { afterEach, describe, expect, it } from 'vite-plus/test';

import type { PieceAction } from '../../src/shared/play/protocol';
import type { SwapAction } from '../../src/shared/play/swapping';
import { dealt, draftingRuntime } from './native-drafting.fixture.ts';
import { readSnapshot } from './native-runtime.fixture.ts';
import { messageOf } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  seat,
  sendCommand,
  stage,
  syncView,
} from './native-runtime.fixture.ts';

/** Sends each command against the revision every sender saw before any of them landed, as players acting at the same moment do. */
async function together(...sends: [NativeConnection, PieceAction][]) {
  const seen = (await syncView(sends[0][0])).snapshot.revision;
  const replies = [];
  for (const [connection, action] of sends) {
    replies.push((await sendCommand(connection, action, undefined, seen)).reply);
  }
  return replies.map((reply) => (reply.type === 'rejected' ? reply.message : 'accepted'));
}

describe('Seats acting at the same moment (#1690)', { timeout: 30_000 }, () => {
  let peer: NativePeer, runtime: NativeRuntime;
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix: string) => admitPlayer(peer, runtime, suffix);

  async function twoDrafting() {
    ({ peer, runtime } = await draftingRuntime());
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    return [a, b];
  }

  it('takes draft picks, bans and readiness that crossed, and deals once both are ready', async () => {
    const [a, b] = await twoDrafting();
    expect(
      await together(
        [a, { kind: 'draft-pick' as const, factionId: 'atreides' }],
        [b, { kind: 'draft-pick' as const, factionId: 'harkonnen' }]
      )
    ).toEqual(['accepted', 'accepted']);
    expect(
      await together(
        [a, { kind: 'draft-ban' as const, factionId: 'fremen' }],
        [b, { kind: 'draft-ban' as const, factionId: 'ixians' }]
      )
    ).toEqual(['accepted', 'accepted']);
    const { draft } = (await syncView(a)).snapshot;
    expect(Object.values(required(draft).picks).flat().sort()).toEqual(['atreides', 'harkonnen']);
    expect(Object.values(required(draft).bans).flat().sort()).toEqual(['fremen', 'ixians']);
    expect(
      await together(
        [a, { kind: 'draft-ready' as const, ready: true }],
        [b, { kind: 'draft-ready' as const, ready: true }]
      )
    ).toEqual(['accepted', 'accepted']);
    await eventually(async () => (await stage(a)) === 'swapping', 'deal');
  });

  it('refuses readiness that crossed a draft change, and a revision from the future', async () => {
    const [a, b] = await twoDrafting();
    expect(
      await together(
        [a, { kind: 'draft-ban' as const, factionId: 'fremen' }],
        [b, { kind: 'draft-ready' as const, ready: true }]
      )
    ).toEqual(['accepted', 'The draft changed. Try the action again.']);
    const ahead = await sendCommand(a, { kind: 'draft-pick' as const, factionId: 'atreides' }, undefined, 1000);
    expect(messageOf(ahead.reply, 'rejected').message).toBe('The draft changed. Try the action again.');
  });

  it('takes draft choices sent from two tabs of one player', async () => {
    const [a, b] = await twoDrafting();
    const tab = await admit('a');
    expect(
      await together(
        [a, { kind: 'draft-ban' as const, factionId: 'fremen' }],
        [tab, { kind: 'draft-ban' as const, factionId: 'ixians' }]
      )
    ).toEqual(['accepted', 'accepted']);
    expect(required((await syncView(b)).snapshot.draft).bans).toEqual({ 'seat-1': ['fremen', 'ixians'] });
  });

  it('closes trading when both players keep their seats at once, but refuses readiness that crossed an offer', async () => {
    ({ peer, runtime } = await draftingRuntime([['emperor', 'Emperor']]));
    const [a, b] = await dealt(peer, runtime, 2);
    const swap = async (
      connection: NativeConnection,
      action: SwapAction extends infer Action
        ? Action extends SwapAction
          ? Omit<Action, 'round' | 'seat'>
          : never
        : never
    ): Promise<SwapAction> => {
      const { snapshot, viewer } = await syncView(connection);
      return { ...action, round: required(snapshot.swapping).round, seat: viewer.viewerSeat };
    };
    expect(
      await together(
        [a, await swap(a, { kind: 'swap-offer' as const, target: 'seat-2' })],
        [b, await swap(b, { kind: 'swap-ready' as const, ready: true })]
      )
    ).toEqual(['accepted', 'The table changed. Try the action again.']);
    await accepted(
      a,
      await swap(a, {
        kind: 'swap-cancel' as const,
        offerId: required((await syncView(a)).snapshot.swapping).offers[0].id,
      })
    );
    expect(
      await together(
        [a, await swap(a, { kind: 'swap-ready' as const, ready: true })],
        [b, await swap(b, { kind: 'swap-ready' as const, ready: true })]
      )
    ).toEqual(['accepted', 'accepted']);
    await eventually(async () => (await stage(a)) === 'setup', 'trading closed');
  });

  it('takes a seat request, its approval and a withdrawal that crossed a draft choice, but not a departure', async () => {
    const [a, b] = await twoDrafting();
    const c = await admit('c');
    expect(
      await together(
        [a, { kind: 'draft-pick' as const, factionId: 'atreides' }],
        [c, { kind: 'seat-request' as const }]
      )
    ).toEqual(['accepted', 'accepted']);
    const request = required((await syncView(c)).snapshot.controls).seatRequests.find((entry) => entry.own);
    expect(
      await together(
        [b, { kind: 'draft-pick' as const, factionId: 'harkonnen' }],
        [a, { kind: 'seat-approve' as const, requestId: required(request).id }]
      )
    ).toEqual(['accepted', 'accepted']);
    expect((await syncView(c)).viewer.viewerSeat).toBe('seat-3');
    const d = await admit('d');
    await accepted(d, { kind: 'seat-request' as const });
    expect(
      await together([a, { kind: 'draft-ban' as const, factionId: 'fremen' }], [d, { kind: 'seat-withdraw' as const }])
    ).toEqual(['accepted', 'accepted']);
    expect(required((await syncView(a)).snapshot.controls).seatRequests).toEqual([]);
    /* Leaving stays strict: the confirmation said what leaving costs, and a crossed departure may have left the sender the last player. */
    expect(
      await together([a, { kind: 'draft-ban' as const, factionId: 'ixians' }], [b, { kind: 'seat-depart' as const }])
    ).toEqual(['accepted', 'The table changed. Try the action again.']);
  });

  it('counts removal ballots cast at once toward the threshold', async () => {
    ({ peer, runtime } = await draftingRuntime([['emperor', 'Emperor']]));
    const all = [await admit('a')];
    for (const suffix of ['b', 'c', 'd']) {
      const connection = await admit(suffix);
      await seat(connection, all[0]);
      all.push(connection);
    }
    const target = (await syncView(all[3])).viewer.viewerSeat;
    const [vote] = required(
      (await accepted(all[0], { kind: 'removal-start' as const, seat: target })).snapshot.removalVotes
    );
    expect(
      await together(
        [all[1], { kind: 'removal-ballot' as const, voteId: vote.id, choice: 'remove' }],
        [all[2], { kind: 'removal-ballot' as const, voteId: vote.id, choice: 'remove' }]
      )
    ).toEqual(['accepted', 'accepted']);
    expect((await syncView(all[3])).viewer.viewerSeat).toBe('neutral');
  });

  describe('at the table', () => {
    let a: NativeConnection, b: NativeConnection;
    async function table(phase: number) {
      peer = await createPeer();
      peer.watchMode = 'allow';
      peer.expiresAt = () => Date.now() + 600_000;
      runtime = await createRuntime(peer, 'game');
      if ((await provision(runtime)).status !== 200) {
        throw new Error('The native fixture did not provision.');
      }
      const rows = await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
      const state = readSnapshot(rows[0].data);
      state.phase = phase;
      await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(state)]);
      await runtime.restart();
      a = await admit('a');
      b = await admit('b');
    }

    it('takes Mentat readiness from both seats at once, but not readiness that crossed a table change', async () => {
      await table(8);
      expect(
        await together([a, { kind: 'ready' as const, ready: true }], [b, { kind: 'ready' as const, ready: true }])
      ).toEqual(['accepted', 'accepted']);
      expect(required((await syncView(a)).snapshot.controls).ready.sort()).toEqual(['atreides', 'harkonnen']);
      expect(
        await together([a, { kind: 'ready' as const, ready: false }], [b, { kind: 'ready' as const, ready: false }])
      ).toEqual(['accepted', 'accepted']);
      const pieceId = required((await syncView(a)).snapshot.table.pieces.find((piece) => !piece.inventory)).id;
      expect(
        await together(
          [a, { kind: 'rotate' as const, pieceId, direction: 1 }],
          [b, { kind: 'ready' as const, ready: true }]
        )
      ).toEqual(['accepted', 'The table changed. Try the action again.']);
    });
  });
});
