import { Button, Group, Text } from '@mantine/core';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import { isBattleLeader } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import { Swords } from 'lucide-react';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { pieceName } from '../multiplayer/HandPiece';
import {
  EmptyHand,
  GroupCaption,
  HandTile,
  PieceActionButtons,
  PieceChrome,
  pieceActions,
  usePieceChrome,
} from './HandParts';
import styles from './HandWindow.module.css';
import { SpiceChips, SpiceSlider, SpiceStepper } from './SpiceParts';
import { handGroups, useHandWindow } from './useHandWindow';
import type { HandWindowModel, HandWindowProps, HandWindowVariant } from './useHandWindow';

/** The Hand & spice window's content, as the prototype a story chose. */
export function HandWindow({ variant, ...props }: HandWindowProps & Readonly<{ variant: HandWindowVariant | null }>) {
  const model = useHandWindow(props);
  switch (variant) {
    case 'fan':
      return <FanHand model={model} />;
    case 'ledger':
      return <LedgerHand model={model} />;
    case 'battle':
      return <BattleHand model={model} />;
    default:
      return <ShelvesHand model={model} />;
  }
}

/* The hand's width, so a piece sent to the side-table lands where a side-table window this wide shows it. */
function useWindowWidth() {
  const { ref: measure, width } = useElementSize<HTMLDivElement>();
  const area = useRef<HTMLDivElement>(null);
  return { ref: useMergedRef(measure, area), area, width };
}

/*
 * A. Shelves: the hand sorted into labelled rows (leaders, then each card back), with spice on top.
 * Hovering a piece raises it and shows its actions under it; one click plays it in front of you, sets it on the side-table
 * or puts it in your battle plan. Spice withdraws with one click on an amount.
 */
function ShelvesHand({ model }: Readonly<{ model: HandWindowModel }>) {
  const { ref, area, width } = useWindowWidth();
  const chrome = usePieceChrome(model.planPieces);
  return (
    <div ref={ref} className={styles.stack}>
      {model.bank && <SpiceChips model={model} />}
      {model.groups.length ? (
        <div className={styles.shelves}>
          {model.groups.map((group) => (
            <section key={group.key} className={styles.shelf} data-group={group.key} aria-label={group.label}>
              <GroupCaption label={group.label} count={group.pieces.length} />
              <div className={styles.shelfRow}>
                {group.pieces.map((piece) => (
                  <HandTile
                    key={piece.id}
                    model={model}
                    piece={piece}
                    chrome={chrome}
                    width={group.key === 'leaders' ? 50 : 54}
                    className={styles.hoverTile}
                  >
                    <div className={styles.hoverActions}>
                      <PieceActionButtons model={model} piece={piece} viewWidth={width} />
                    </div>
                  </HandTile>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyHand />
      )}
      <PieceChrome model={model} chrome={chrome} area={area} viewWidth={width} />
    </div>
  );
}

/*
 * B. Fan: the cards held as a real hand, fanned and overlapping, with the leaders in a row above.
 * Hovering a card lifts it out of the fan at a readable size; clicking picks it, and the picked piece's actions
 * stand as labelled buttons under the fan. Spice steps with − and + (or the wheel) and withdraws.
 */
function FanHand({ model }: Readonly<{ model: HandWindowModel }>) {
  const { ref, area, width } = useWindowWidth();
  const chrome = usePieceChrome(model.planPieces);
  const [pickedId, pick] = useState<string | null>(null);
  const picked = model.inHand.find((piece) => piece.id === pickedId) ?? null;
  const leaders = model.inHand.filter(isBattleLeader);
  const cards = model.inHand.filter((piece) => !isBattleLeader(piece));
  const toggle = (piece: TablePiece) => pick((id) => (id === piece.id ? null : piece.id));
  return (
    <div ref={ref} className={styles.stack}>
      {model.bank && <SpiceStepper model={model} />}
      {!model.inHand.length && <EmptyHand />}
      {leaders.length > 0 && (
        <div className={styles.leaderRow} aria-label="Leaders" role="group">
          {leaders.map((piece) => (
            <HandTile
              key={piece.id}
              model={model}
              piece={piece}
              chrome={chrome}
              width={52}
              className={styles.leaderTile}
              selected={piece.id === pickedId}
              onClick={() => toggle(piece)}
            />
          ))}
        </div>
      )}
      {cards.length > 0 && (
        <div className={styles.fan} aria-label="Cards" role="group">
          {cards.map((piece, index) => (
            <HandTile
              key={piece.id}
              model={model}
              piece={piece}
              chrome={chrome}
              width={72}
              className={styles.fanCard}
              selected={piece.id === pickedId}
              style={{ '--i': index - (cards.length - 1) / 2 } as CSSProperties}
              onClick={() => toggle(piece)}
            />
          ))}
        </div>
      )}
      <div className={styles.pickBar} data-open={Boolean(picked) || undefined}>
        {picked ? (
          <>
            <Text size="sm" fw={600} className={styles.pickName}>
              {pieceName(picked)}
            </Text>
            <Group gap={6} wrap="wrap">
              {pieceActions(model, picked, width).map((action) => (
                <Button
                  key={action.key}
                  size="compact-sm"
                  variant={action.pressed ? 'light' : 'default'}
                  leftSection={action.icon}
                  disabled={Boolean(action.disabledReason)}
                  title={action.disabledReason}
                  onClick={() => {
                    action.run();
                    if (action.key !== 'plan') {
                      pick(null);
                    }
                  }}
                >
                  {action.key === 'play'
                    ? 'Play'
                    : action.key === 'side'
                      ? 'Side-table'
                      : action.pressed
                        ? 'In plan'
                        : 'Plan'}
                </Button>
              ))}
            </Group>
          </>
        ) : (
          <Text size="xs" c="dimmed">
            Click a piece to play it, set it aside or plan with it. Drag it onto the table to place it yourself.
          </Text>
        )}
      </div>
      <PieceChrome model={model} chrome={chrome} area={area} viewWidth={width} />
    </div>
  );
}

/*
 * C. Ledger: one row per piece with its name readable at a glance and its actions at the row's end,
 * filtered by kind. Built for a long hand. Spice withdraws by slider.
 */
function LedgerHand({ model }: Readonly<{ model: HandWindowModel }>) {
  const { ref, area, width } = useWindowWidth();
  const chrome = usePieceChrome(model.planPieces);
  const groups = handGroups(model.inHand);
  const [filter, setFilter] = useState('all');
  const shown =
    filter === 'all' || !groups.some((group) => group.key === filter)
      ? model.inHand
      : (groups.find((group) => group.key === filter)?.pieces ?? []);
  return (
    <div ref={ref} className={styles.stack}>
      {model.bank && <SpiceSlider model={model} />}
      {groups.length > 1 && (
        <Group gap={4} role="group" aria-label="Show">
          {[
            { value: 'all', label: `All ${model.inHand.length}` },
            ...groups.map((group) => ({ value: group.key, label: `${group.label} ${group.pieces.length}` })),
          ].map((option) => (
            <Button
              key={option.value}
              size="compact-xs"
              variant={filter === option.value ? 'light' : 'subtle'}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </Group>
      )}
      {!model.inHand.length && <EmptyHand />}
      <ul className={styles.ledger} aria-label="Your hand">
        {shown.map((piece) => (
          <li key={piece.id} className={styles.ledgerRow} data-leaving={model.leaving.get(piece.id)}>
            <HandTile model={model} piece={piece} chrome={chrome} width={26} className={styles.ledgerThumb} />
            <Text size="sm" fw={600} truncate className={styles.ledgerName}>
              {pieceName(piece)}{' '}
              <Text component="span" size="xs" c="dimmed" fw={400}>
                {isBattleLeader(piece) ? 'Leader' : (piece.items[0]?.artwork?.backName ?? 'Card')}
                {model.inPlan(piece) ? ' · in plan' : ''}
              </Text>
            </Text>
            <PieceActionButtons model={model} piece={piece} viewWidth={width} emphasis="quiet" />
          </li>
        ))}
      </ul>
      <PieceChrome model={model} chrome={chrome} area={area} viewWidth={width} />
    </div>
  );
}

/*
 * D. Battle-aware: in a battle the window leads with your plan (a leader slot, the cards, the spice behind the dial),
 * and a click on any piece in the hand puts it in the plan or takes it out. Outside a battle it is the shelves.
 */
function BattleHand({ model }: Readonly<{ model: HandWindowModel }>) {
  const { ref, area, width } = useWindowWidth();
  const chrome = usePieceChrome(model.planPieces);
  const { plan, battle } = model;
  if (!plan || !battle) {
    return <ShelvesHand model={model} />;
  }
  const leader = plan.leaderId ? model.planPieces.find((piece) => piece.id === plan.leaderId) : undefined;
  const cards = plan.cardIds.flatMap((id) => model.planPieces.filter((piece) => piece.id === id));
  return (
    <div ref={ref} className={styles.stack}>
      <section className={styles.planStrip} aria-label="Battle plan" data-open={model.planOpen || undefined}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" fw={700} tt="uppercase" className={styles.caption}>
            <Swords size={12} aria-hidden /> Plan for {battle.territory}
          </Text>
          {!model.planOpen && (
            <Text size="xs" c="dimmed">
              Locked
            </Text>
          )}
        </Group>
        <div className={styles.planSlots}>
          <PlanSlot label="Leader" piece={leader} model={model} chrome={chrome} round />
          {cards.map((piece) => (
            <PlanSlot key={piece.id} label="Card" piece={piece} model={model} chrome={chrome} />
          ))}
          <PlanSlot label="Card" model={model} chrome={chrome} />
          <div className={styles.planSpice}>
            <Text size="xs" c="dimmed">
              Spice on the dial
            </Text>
            <Text component="span" fw={700} className={styles.stepValue}>
              {model.committed}
            </Text>
          </div>
        </div>
      </section>
      <div className={styles.shelfRow}>
        {model.inHand
          .filter((piece) => !model.inPlan(piece))
          .map((piece) => (
            <HandTile
              key={piece.id}
              model={model}
              piece={piece}
              chrome={chrome}
              width={56}
              className={styles.pickable}
              onClick={() => model.togglePlan(piece)}
            />
          ))}
      </div>
      <Text size="xs" c="dimmed">
        Click a piece to put it in your plan. Right-click for more, or drag it onto the table.
      </Text>
      {model.bank && <SpiceChips model={model} />}
      <PieceChrome model={model} chrome={chrome} area={area} viewWidth={width} />
    </div>
  );
}

/* One place in the plan: the piece in it, which a click takes back to the hand, or an empty outline. */
function PlanSlot({
  label,
  piece,
  model,
  chrome,
  round,
}: Readonly<{
  label: string;
  piece?: TablePiece;
  model: HandWindowModel;
  chrome: ReturnType<typeof usePieceChrome>;
  round?: boolean;
}>) {
  if (piece) {
    return (
      <HandTile
        model={model}
        piece={piece}
        chrome={chrome}
        width={48}
        className={styles.planned}
        onClick={() => model.togglePlan(piece)}
      />
    );
  }
  return (
    <div className={styles.emptySlot} data-round={round || undefined} aria-label={`No ${label.toLowerCase()} in plan`}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </div>
  );
}
