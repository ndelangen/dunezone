import { Menu, Text } from '@mantine/core';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import type { TablePiece } from '@shared/play/model';
import { Section } from '@ui/block/Section';
import { SortableRow } from '@ui/control/SortableRow';
import { ArrowUpFromLine, EyeOff } from 'lucide-react';
import { useRef, useState } from 'react';

import { HandPieceCloseUp } from '../../../../widgets/tabletop/PieceCloseUp';
import { dropOnTable } from '../multiplayer/dropOnTable';
import { PieceImage, pieceName, useHandCloseUp } from '../multiplayer/HandPiece';
import { HandPieceMenu, handMenuAnchor } from '../multiplayer/HiddenZone';
import type { HandMenuAnchor } from '../multiplayer/HiddenZone';
import { HAND_HELP } from '../multiplayer/panelGuidance';
import styles from './Hand.module.css';
import { useHandActions } from './useHandActions';
import type { HandActions, HandProps } from './useHandActions';

/* What a right-click on a piece offers: play it in front of you, or set it on your side-table. */
function pieceActions(actions: HandActions, piece: TablePiece, viewWidth: number) {
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
 * The hand as shelves: the Treachery cards, the leaders on a row of their own, then each other kind of card under its name and count.
 * A piece lifts under the pointer;
 * drag it onto the table, or along its shelf to put the hand in your own order, right-click it for its actions, or hold Alt to see it close up.
 */
export function HandShelves(props: HandProps) {
  const actions = useHandActions(props);
  const { ref: measure, width } = useElementSize<HTMLDivElement>();
  const area = useRef<HTMLDivElement>(null);
  const ref = useMergedRef(measure, area);
  const [menu, setMenu] = useState<HandMenuAnchor | null>(null);
  const closeUp = useHandCloseUp(actions.inHand);
  const menuPiece = menu ? actions.inHand.find((piece) => piece.id === menu.pieceId) : undefined;
  const tile = (piece: TablePiece, tileWidth: number) => {
    return (
      <div
        key={piece.id}
        className={styles.tile}
        data-leaving={actions.leaving(piece)}
        data-round={piece.kind !== 'card' || undefined}
      >
        <button
          type="button"
          className={styles.face}
          aria-label={`Drag ${pieceName(piece)} from hand`}
          onContextMenu={(event) => setMenu(handMenuAnchor(event, piece.id))}
          {...closeUp.hover(piece)}
        >
          <PieceImage
            piece={piece}
            width={tileWidth}
            height={piece.kind === 'card' ? (tileWidth * 4) / 3 : tileWidth}
          />
        </button>
      </div>
    );
  };
  return (
    <Section hiddenHeading title="Your hand and leaders" description={HAND_HELP}>
      <div ref={ref} className={styles.shelves}>
        {actions.groups.map((group) => (
          <section key={group.key} className={styles.shelf} data-group={group.key} aria-label={group.label}>
            <Text size="xs" fw={700} tt="uppercase" className={styles.caption}>
              {group.label} <span className={styles.count}>{group.pieces.length}</span>
            </Text>
            <SortableRow
              items={group.pieces}
              disabled={!actions.enabled}
              className={styles.row}
              onMove={actions.reorder}
              onDropOutside={(piece, point) => dropOnTable(piece.id, point.x, point.y)}
            >
              {(piece) => tile(piece, group.key === 'leaders' ? TILE_WIDTH.leaders : TILE_WIDTH.cards)}
            </SortableRow>
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
