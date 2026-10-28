import { Button, Loader, Stack, Text, VisuallyHidden } from '@mantine/core';
import { recallConversation } from '@shared/play/conversations';
import {
  HIDDEN_ZONE_DEPTH,
  HIDDEN_ZONE_MIN_SCALE,
  HIDDEN_ZONE_WIDTH,
  hiddenZoneFootprint,
  hiddenZonePieces,
} from '@shared/play/hiddenZone';
import type { TablePiece } from '@shared/play/model';
import { HIDDEN_ZONE_TURNS } from '@shared/play/schema';
import { useId } from 'react';

import type { TableProjection, TableSession } from '@db/tabletop/TableSession';
import { useMotionAllowed } from '@app/styles/motion';
import { PieceArtwork } from '@app/widgets/tabletop/PieceArtwork';

import type { CompassTable } from '../compass/compassTable';
import { ConnectedConversationPanel } from '../panels/chat/useConversationPanel';
import { CheckpointPicker } from './checkpoints/CheckpointPicker';
import styles from './MentatRecall.module.css';

/** The shared checkpoint and private recorded inventories, with no mutation controls in their rendering. */
export function mentatRecall(client: TableSession, table: TableProjection): CompassTable['recall'] {
  const review = table.review;
  const current = review?.current;
  if (!review || !current || current.startedAt === null) {
    return;
  }
  const loading = table.historyPending || table.playback?.step !== current.step;
  const failure = loading && !table.historyPending ? client.getSnapshot().error : null;
  const inventory = (side: boolean) =>
    loading ? (
      <Loader size="sm" aria-label="Loading recalled inventory" />
    ) : table.snapshot.hand === undefined ? (
      <Text size="sm">Private contents are unavailable for this checkpoint and seat.</Text>
    ) : (
      <FrozenInventory
        hand={table.snapshot.hand}
        order={table.snapshot.handOrder ?? []}
        side={side}
        balance={table.snapshot.bank?.balance}
        context={current.context}
      />
    );
  return {
    id: current.id,
    context: current.context,
    loading,
    panels: [
      {
        key: 'recall-history',
        label: 'Shared history',
        topic: 'turn',
        description: 'Changing the checkpoint moves everyone. Your camera and panel layout are personal.',
        content: (
          <Stack gap="sm">
            {failure ? (
              <Stack gap="xs">
                <Text size="sm" role="alert">
                  {failure}
                </Text>
                <Button size="xs" onClick={client.retryRecall}>
                  Retry checkpoint
                </Button>
              </Stack>
            ) : (
              loading && (
                <Text size="sm" role="status">
                  Loading the selected checkpoint...
                </Text>
              )
            )}
            {review.seat ? (
              <CheckpointPicker
                checkpoints={review.checkpoints}
                value={current.step}
                onChange={(step) => client.command({ kind: 'review-seek', reviewId: current.id, step })}
              />
            ) : (
              <Text size="sm">{current.context}. A seated player can change the shared checkpoint.</Text>
            )}
          </Stack>
        ),
      },
      ...(review.seat
        ? [
            { key: 'hand', label: 'Your recalled hand', topic: 'hand' as const, content: inventory(false) },
            {
              key: 'hidden-zone',
              label: 'Your recalled private side table',
              topic: 'hiddenZone' as const,
              content: inventory(true),
            },
            {
              key: 'recall-chat',
              label: 'Recall chat',
              topic: 'planet' as const,
              description: 'Only this recall. All messages and drafts disappear when play resumes.',
              content: (
                <Stack gap="sm">
                  <Text size="sm">This chat is separate from table chat. It disappears when this recall closes.</Text>
                  <ConnectedConversationPanel
                    key={current.id}
                    client={client}
                    peerId={recallConversation(current.id)}
                  />
                </Stack>
              ),
            },
          ]
        : []),
    ],
  };
}

function FrozenInventory({
  hand,
  order,
  side,
  context,
  balance,
}: Readonly<{ hand: TablePiece[]; order: readonly string[]; side: boolean; context: string; balance?: number }>) {
  const positions = new Map(order.map((id, index) => [id, index]));
  const pieces = side
    ? hiddenZonePieces(hand)
    : hand
        .filter((piece) => !piece.hiddenZone)
        .sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  const placements = pieces.map((piece) => {
    const footprint = hiddenZoneFootprint(piece);
    const width = footprint.width * HIDDEN_ZONE_MIN_SCALE;
    const height = footprint.depth * HIDDEN_ZONE_MIN_SCALE;
    const angle = ((piece.hiddenZone?.turn ?? 0) * 2 * Math.PI) / HIDDEN_ZONE_TURNS;
    return {
      x: (piece.hiddenZone?.x ?? 0) * HIDDEN_ZONE_WIDTH * HIDDEN_ZONE_MIN_SCALE,
      y: (piece.hiddenZone?.y ?? 0) * HIDDEN_ZONE_DEPTH * HIDDEN_ZONE_MIN_SCALE,
      width,
      height,
      angle,
      halfWidth: (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height) / 2,
      halfHeight: (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height) / 2,
    };
  });
  const left = Math.min(0, ...placements.map((spot) => spot.x - spot.halfWidth));
  const top = Math.min(0, ...placements.map((spot) => spot.y - spot.halfHeight));
  const right = Math.max(
    HIDDEN_ZONE_WIDTH * HIDDEN_ZONE_MIN_SCALE,
    ...placements.map((spot) => spot.x + spot.halfWidth)
  );
  const bottom = Math.max(
    HIDDEN_ZONE_DEPTH * HIDDEN_ZONE_MIN_SCALE,
    ...placements.map((spot) => spot.y + spot.halfHeight)
  );
  return (
    <Stack gap="sm">
      <Text size="sm">Your seat's items at {context}. Frozen and visible only to this seat.</Text>
      {!side && balance !== undefined && <Text size="sm">Spice reserve: {balance}</Text>}
      {pieces.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nothing was here at this checkpoint.
        </Text>
      ) : (
        <div className={styles.inventoryScroll}>
          <div
            className={side ? styles.sideTable : styles.hand}
            style={side ? { width: right - left, height: bottom - top } : undefined}
          >
            {pieces.map((piece, index) => {
              const item = piece.items.at(-1);
              const visible = !side || item?.faceUp;
              const source = visible ? (item?.artwork?.front ?? item?.artwork?.back) : item?.artwork?.back;
              const name = visible
                ? (item?.artwork?.name ?? piece.label)
                : (item?.artwork?.backName ?? 'Face-down piece');
              const spot = placements[index]!;
              const width = side ? spot.width : piece.kind === 'card' ? 100 : 64;
              const height = side ? spot.height : piece.kind === 'card' ? 140 : 64;
              return (
                <figure
                  key={piece.id}
                  className={side ? styles.placed : styles.piece}
                  style={
                    side
                      ? {
                          left: spot.x - left,
                          top: spot.y - top,
                          width,
                          height,
                          transform: `translate(-50%, -50%) rotate(${((piece.hiddenZone!.turn ?? 0) * 360) / HIDDEN_ZONE_TURNS}deg)`,
                        }
                      : undefined
                  }
                >
                  <PieceArtwork piece={piece} src={source ?? null} name={name} width={width} height={height} />
                  {side ? (
                    <VisuallyHidden component="figcaption">
                      {name}
                      {piece.items.length > 1 ? ` × ${piece.items.length}` : ''}
                    </VisuallyHidden>
                  ) : (
                    <figcaption>
                      {name}
                      {piece.items.length > 1 ? ` × ${piece.items.length}` : ''}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        </div>
      )}
      <Text size="xs" c="dimmed">
        Read only. No moving, rearranging, flipping or peeking.
      </Text>
    </Stack>
  );
}

/** Persistent decoration crossfades with the mode while the same camera and board remain mounted. */
export function MentatRecallBackdrop({ active }: Readonly<{ active: boolean }>) {
  const id = useId();
  const motion = useMotionAllowed();
  return (
    <div className={styles.backdrop} data-active={active} data-motion={motion} aria-hidden="true">
      <div className={styles.tint} />
      <svg className={styles.pattern} width="100%" height="100%" focusable="false">
        <defs>
          <pattern id={id} width="300" height="125" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
            {motion && active && (
              <animateTransform
                attributeName="patternTransform"
                type="translate"
                from="0 0"
                to="-300 0"
                dur="45s"
                repeatCount="indefinite"
                additive="sum"
              />
            )}
            <text x="12" y="60" fontSize="17" letterSpacing="3">
              MENTAT RECALL
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}
