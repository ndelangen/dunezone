import { Menu, Text } from '@mantine/core';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import type { TablePiece } from '@shared/play/model';
import { Section } from '@ui/block/Section';
import { SortableRow } from '@ui/control/SortableRow';
import { ArrowUpFromLine, EyeOff } from 'lucide-react';
import { useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { HandPieceCloseUp } from '../../../../../widgets/tabletop/PieceCloseUp';
import { CompassActiveContext } from '../../compass/controlsActive';
import { dropFromHand } from '../../multiplayer/dropFromHand';
import { PieceImage, pieceName, useHandCloseUp } from '../../multiplayer/HandPiece';
import { HandPieceMenu, handMenuAnchor } from '../../multiplayer/HandPieceMenu';
import type { HandMenuAnchor } from '../../multiplayer/HandPieceMenu';
import { HAND_HELP } from '../../multiplayer/panelGuidance';
import { handGroups } from './handGroups';
import type { HandGroup } from './handGroups';
import styles from './HandPanel.module.css';
import type { HandActions } from './useHandActions';

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

export type HandPanelProps =
  | Readonly<{
      isFrozen?: false;
      /** The hand's pieces in reading order, and what each piece's menu and drags do. */
      actions: HandActions;
    }>
  | Readonly<{ isFrozen: true; pieces: readonly TablePiece[] }>;

/* The leaders' discs and the cards' faces, at the size the shelves read best in a pinned slot. */
const TILE_WIDTH = { leaders: 50, cards: 54 };

/**
 * The hand's shared shelves and artwork, with a frozen state that mounts no menus or drag targets.
 */
export function HandPanel(props: HandPanelProps) {
  return props.isFrozen ? <FrozenHand pieces={props.pieces} /> : <InteractiveHand actions={props.actions} />;
}

function HandShelf({ group, children }: Readonly<{ group: HandGroup; children: ReactNode }>) {
  return (
    <section className={styles.shelf} data-group={group.key} aria-label={group.label}>
      <Text size="xs" fw={700} tt="uppercase" className={styles.caption} data-hand-label>
        {group.label} <span className={styles.count}>{group.pieces.length}</span>
      </Text>
      {children}
    </section>
  );
}

function FrozenHand({ pieces }: Readonly<{ pieces: readonly TablePiece[] }>) {
  const groups = handGroups(pieces);
  return (
    <Section hiddenHeading title="Your hand and leaders">
      <div className={styles.shelves}>
        {groups.map((group) => (
          <HandShelf key={group.key} group={group}>
            <div className={styles.row}>
              {group.pieces.map((piece) => {
                const width = group.key === 'leaders' ? TILE_WIDTH.leaders : TILE_WIDTH.cards;
                return (
                  <div key={piece.id} className={styles.tile} data-round={piece.kind !== 'card' || undefined}>
                    <div className={styles.face} data-piece-id={piece.id}>
                      <PieceImage
                        piece={piece}
                        width={width}
                        height={piece.kind === 'card' ? (width * 4) / 3 : width}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </HandShelf>
        ))}
        {!groups.length && (
          <Text size="sm" c="dimmed">
            Your hand is empty.
          </Text>
        )}
      </div>
    </Section>
  );
}

function InteractiveHand({ actions }: Readonly<{ actions: HandActions }>) {
  const active = useContext(CompassActiveContext);
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
          data-piece-id={piece.id}
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
          <HandShelf key={group.key} group={group}>
            <SortableRow
              items={group.pieces}
              disabled={!active || !actions.enabled}
              className={styles.row}
              onMove={actions.reorder}
              leaving={(piece) => actions.leaving(piece) !== undefined}
              onDropOutside={(piece, point) => {
                const drop = dropFromHand(piece.id, point.x, point.y);
                if (drop?.where === 'side') {
                  actions.left(piece, drop.commandId);
                }
              }}
            >
              {(piece) => tile(piece, group.key === 'leaders' ? TILE_WIDTH.leaders : TILE_WIDTH.cards)}
            </SortableRow>
          </HandShelf>
        ))}
        {!actions.groups.length && (
          <Text size="sm" c="dimmed">
            Your hand is empty. Right-click a card or leader on the table and choose Take into hand.
          </Text>
        )}
      </div>
      {active && <HandPieceCloseUp area={area} piece={closeUp.piece} />}
      {active && (
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
      )}
    </Section>
  );
}
