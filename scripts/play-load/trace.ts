import assert from 'node:assert/strict';

import type { ClientMessage, CommitMessage, PieceAction } from '../../src/shared/play/protocol.ts';
import type { Peer, InteractionSample, ViewMessage } from './types.ts';
type Piece = ViewMessage['snapshot']['table']['pieces'][number];
type Recorded = { message: CommitMessage; result: ViewMessage };
type TraceOptions = {
  peer: Peer;
  request: (peer: Peer, message: ClientMessage, key: string) => Promise<unknown>;
  durable: (peer: Peer, action: PieceAction, operation?: string, sample?: InteractionSample) => Promise<Recorded>;
  record: (peer: Peer, message: CommitMessage, operation: string, sample?: InteractionSample) => Promise<Recorded>;
  seed: number;
  operations: string[];
};

/** Saved actions use the same requests as the browser, including carry admission for drops. */
export async function createTrace({ peer, request, durable, record, seed, operations }: TraceOptions) {
  let sequence = 0;
  const current = () => {
    assert.ok(peer.view);
    return peer.view;
  };
  const pieces = () => current().snapshot.table.pieces;
  const byItem = (item: string | undefined) => {
    const piece = pieces().find((candidate) => candidate.items.some((entry) => entry.id === item));
    assert.ok(piece, `The trace lost item ${item}.`);
    return piece;
  };
  const move = async (
    piece: Piece,
    position: [number, number, number],
    operation = 'move',
    count = true,
    interaction?: InteractionSample
  ) => {
    const carryId = `trace-${seed}-${sequence++}`;
    if (interaction) {
      interaction.carryRequestedAt = performance.now();
    }
    await request(
      peer,
      {
        type: 'begin',
        carryId,
        sourcePieceId: piece.id,
        expectedVersion: current().snapshot.versions[piece.id],
        pickup: 'whole',
      },
      carryId
    );
    if (interaction) {
      interaction.carryAdmittedAt = performance.now();
    }
    const message: CommitMessage = {
      type: 'drop',
      carryId,
      commandId: `${carryId}-drop`,
      position,
      orientation: piece.orientation,
    };
    return count ? record(peer, message, operation, interaction) : request(peer, message, message.commandId);
  };
  const tokens = pieces()
    .filter((piece: { kind: string }) => piece.kind === 'force')
    .slice(-2);
  const cards = pieces()
    .filter((piece: { kind: string }) => piece.kind === 'card')
    .slice(-2);
  assert.equal(tokens.length, 2);
  assert.equal(cards.length, 2);
  let tokenItem = tokens[1].items[0].id;
  let cardItem = cards[1].items[0].id;
  await move(tokens[1], [-3, 0, 2], 'setup', false);
  await move(cards[1], [3, 0, 2], 'setup', false);
  if (byItem(tokenItem).items.length < 2) {
    await move(tokens[0], byItem(tokenItem).position, 'setup', false);
  }
  if (byItem(cardItem).items.length < 2) {
    await move(cards[0], byItem(cardItem).position, 'setup', false);
  }
  assert.ok(byItem(tokenItem).items.length >= 2);
  assert.ok(byItem(cardItem).items.length >= 2);
  const reservedItems = new Set([
    ...byItem(tokenItem).items.map((item) => item.id),
    ...byItem(cardItem).items.map((item) => item.id),
  ]);
  let splitItem: string | undefined;
  let drawnItem: string | undefined;
  return {
    operations,
    reservedItems,
    async step(index: number, interaction?: InteractionSample) {
      const operation = operations[index % operations.length];
      const token = byItem(tokenItem);
      const card = byItem(cardItem);
      switch (operation) {
        case 'move':
          await move(card, [3, 0, Math.floor(index / operations.length) % 2 ? 2 : 3], operation, true, interaction);
          break;
        case 'rotate':
          await durable(peer, { kind: 'rotate', pieceId: card.id, direction: 1 }, operation, interaction);
          break;
        case 'flip':
          await durable(peer, { kind: 'flip', pieceId: card.id }, operation, interaction);
          break;
        case 'split':
          tokenItem = token.items[0].id;
          splitItem = token.items.at(-1)!.id;
          await durable(peer, { kind: 'split', pieceId: token.id, count: 1 }, operation, interaction);
          assert.notEqual(byItem(splitItem).id, byItem(tokenItem).id);
          break;
        case 'merge':
          await move(byItem(splitItem), token.position, operation, true, interaction);
          assert.equal(byItem(splitItem).id, byItem(tokenItem).id);
          break;
        case 'draw':
          cardItem = card.items[0].id;
          drawnItem = card.items.at(-1)!.id;
          await durable(peer, { kind: 'split', pieceId: card.id, count: 1 }, operation, interaction);
          assert.notEqual(byItem(drawnItem).id, byItem(cardItem).id);
          break;
        case 'return-draw':
          await move(byItem(drawnItem), card.position, operation, true, interaction);
          assert.equal(byItem(drawnItem).id, byItem(cardItem).id);
          break;
      }
    },
  };
}
