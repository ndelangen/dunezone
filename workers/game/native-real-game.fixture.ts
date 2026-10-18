import { expect } from 'vite-plus/test';

import { arrakisBoardCapture } from '../../src/shared/play/fixtures/board';
import type { PieceAction } from '../../src/shared/play/protocol';
import { cardPage, deckPage, slot } from './native-catalogue.fixture.ts';
import type { NativeConnection, NativePeer } from './native-runtime.fixture.ts';
import { createPeer, createRuntime, provision, required, sendCommand } from './native-runtime.fixture.ts';

const CREATOR = { userId: 'user-a', displayName: 'Synthetic A' };

/** A provisioned real game for three players with a one-card treachery deck and a five-card spice deck, created by synthetic player A. */
export async function realGame() {
  const peer: NativePeer = await createPeer();
  peer.watchMode = 'allow';
  peer.expiresAt = () => Date.now() + 600_000;
  peer.game = { rulesetId: 'ruleset-one', minimumPlayers: 3, creator: CREATOR };
  const card = cardPage('card-one');
  const [treachery, spice] = [deckPage('treachery-deck', [card]), deckPage('spice-deck', [card], 5)];
  for (const page of [card, treachery, spice]) {
    peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
  }
  peer.rulesets.set('ruleset-one', {
    board: arrakisBoardCapture,
    ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
    slots: [slot('treachery', treachery), slot('spice', spice)],
  });
  const runtime = await createRuntime(peer, 'game');
  if ((await provision(runtime)).status !== 200) {
    throw new Error('The real game did not provision.');
  }
  return { peer, runtime };
}

/** Sends a command that has to be rejected and returns the rejection's message. */
export async function rejected(connection: NativeConnection, action: PieceAction) {
  const { reply } = await sendCommand(connection, action);
  expect(reply.type).toBe('rejected');
  return required(reply.type === 'rejected' ? reply.message : undefined);
}
