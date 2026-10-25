import { Menu, Text } from '@mantine/core';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import type { TablePiece } from '@shared/play/model';
import { Section } from '@ui/block/Section';
import { ArrowUpFromLine, EyeOff, Swords } from 'lucide-react';
import { useRef, useState } from 'react';

import { HandPieceCloseUp } from '../../../../widgets/tabletop/PieceCloseUp';
import { PieceImage, pieceName, useHandCloseUp } from '../multiplayer/HandPiece';
import { HandPieceMenu, handMenuAnchor } from '../multiplayer/HiddenZone';
import type { HandMenuAnchor } from '../multiplayer/HiddenZone';
import { handHelp } from '../multiplayer/panelGuidance';
import styles from './Hand.module.css';
import { dragFromHand, useHandActions } from './useHandActions';
import type { HandActions, HandProps } from './useHandActions';

/*
 * What a right-click on a piece offers: play it in front of you, set it on your side-table, or put it in your battle plan.
 * A piece committed to the plan has left the hand, so taking it out of the plan is all it offers.
 */
function pieceActions(actions: HandActions, piece: TablePiece, viewWidth: number) {
  const planned = actions.inPlan(piece);
  const held = actions.inHand.some((entry) => entry.id === piece.id);
  return [
    ...(held ? handOnlyActions(actions, piece, viewWidth) : []),
    ...(actions.plan
      ? [
          {
            key: 'plan',
            label: planned ? 'Take out of battle plan' : 'Add to battle plan',
            icon: <Swords size={16} aria-hidden />,
            disabled: Boolean(actions.planReason(piece)),
            run: () => actions.togglePlan(piece),
          },
        ]
      : []),
  ];
}

function handOnlyActions(actions: HandActions, piece: TablePiece, viewWidth: number) {
  return [
    {
      key: 'play',
      label: 'Play in front of me',
      icon: <ArrowUpFromLine size={16} aria-hidden />,
      disabled: Boolean(actions.playReason),
      run: () => actions.playInFront(piece),
    },
    {
      key: 'side',
      label: 'Move to private side-table',
      icon: <EyeOff size={16} aria-hidden />,
      disabled: !actions.enabled,
      run: () => actions.toSideTable(piece, viewWidth),
    },
  ];
}

/* The leaders' discs and the cards' faces, at the size the shelves read best in a pinned slot. */
const TILE_WIDTH = { leaders: 50, cards: 54 };

/**
 * The hand as shelves: the leaders on a row of their own, then each kind of card under its name and count.
 * A piece lifts under the pointer;
 * drag it onto the table, right-click it for its actions, or hold Alt to see it close up.
 * In a battle the pieces in your plan stay on their shelf, ringed, even once committed, so taking one back is the same right-click.
 */
export function HandShelves(props: HandProps) {
  const actions = useHandActions(props);
  const { ref: measure, width } = useElementSize<HTMLDivElement>();
  const area = useRef<HTMLDivElement>(null);
  const ref = useMergedRef(measure, area);
  const [menu, setMenu] = useState<HandMenuAnchor | null>(null);
  const closeUp = useHandCloseUp(actions.planPieces);
  const menuPiece = menu ? actions.planPieces.find((piece) => piece.id === menu.pieceId) : undefined;
  const tile = (piece: TablePiece, tileWidth: number) => {
    const inPlan = actions.inPlan(piece);
    const inHand = actions.inHand.some((held) => held.id === piece.id);
    return (
      <div
        key={piece.id}
        className={styles.tile}
        data-leaving={actions.leaving(piece)}
        data-planned={inPlan || undefined}
        data-round={piece.kind !== 'card' || undefined}
      >
        <button
          type="button"
          className={styles.face}
          draggable={actions.enabled && inHand}
          aria-label={inPlan ? `${pieceName(piece)}, in battle plan` : `Drag ${pieceName(piece)} from hand`}
          onDragStart={dragFromHand(piece)}
          onContextMenu={(event) => setMenu(handMenuAnchor(event, piece.id))}
          {...closeUp.hover(piece)}
        >
          <PieceImage
            piece={piece}
            width={tileWidth}
            height={piece.kind === 'card' ? (tileWidth * 4) / 3 : tileWidth}
          />
          {inPlan && (
            <span className={styles.planBadge} aria-hidden>
              <Swords size={11} />
            </span>
          )}
        </button>
      </div>
    );
  };
  return (
    <Section hiddenHeading title="Your hand and leaders" description={handHelp(props.table)}>
      <div ref={ref} className={styles.shelves}>
        {actions.groups.map((group) => (
          <section key={group.key} className={styles.shelf} data-group={group.key} aria-label={group.label}>
            <Text size="xs" fw={700} tt="uppercase" className={styles.caption}>
              {group.label} <span className={styles.count}>{group.pieces.length}</span>
            </Text>
            <div className={styles.row}>
              {group.pieces.map((piece) =>
                tile(piece, group.key === 'leaders' ? TILE_WIDTH.leaders : TILE_WIDTH.cards)
              )}
            </div>
          </section>
        ))}
        {!actions.groups.length && (
          <Text size="sm" c="dimmed">
            Your hand is empty. Right-click a card or leader on the table and choose Take into hand.
          </Text>
        )}
      </div>
      <HandPieceCloseUp area={area} piece={closeUp.piece} />
      <HandPieceMenu anchor={menu} label="Hand actions" onClose={() => setMenu(null)}>
        {menuPiece &&
          pieceActions(actions, menuPiece, width).map((action) => (
            <Menu.Item
              key={action.key}
              leftSection={action.icon}
              disabled={action.disabled}
              onClick={() => {
                action.run();
                setMenu(null);
              }}
            >
              {action.label}
            </Menu.Item>
          ))}
      </HandPieceMenu>
    </Section>
  );
}
