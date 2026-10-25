import { Group, Menu, Text } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import { IconAction } from '@ui/control/IconAction';
import clsx from 'clsx';
import { ArrowUpFromLine, EyeOff, Swords } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

import { HandPieceCloseUp } from '../../../../widgets/tabletop/PieceCloseUp';
import { PieceImage, pieceName, useHandCloseUp } from '../multiplayer/HandPiece';
import { HandPieceMenu, handMenuAnchor } from '../multiplayer/HiddenZone';
import type { HandMenuAnchor } from '../multiplayer/HiddenZone';
import styles from './HandWindow.module.css';
import { dragFromHand } from './useHandWindow';
import type { HandWindowModel } from './useHandWindow';

/** The one-click actions every prototype offers on a piece: play it in front of you, set it on your side-table, or put it in your battle plan. */
export function pieceActions(model: HandWindowModel, piece: TablePiece, viewWidth?: number) {
  const planned = model.inPlan(piece);
  return [
    {
      key: 'play',
      label: 'Play in front of me',
      icon: <ArrowUpFromLine size={16} aria-hidden />,
      disabledReason: model.playReason,
      run: () => model.playInFront(piece),
    },
    {
      key: 'side',
      label: 'Move to private side-table',
      icon: <EyeOff size={16} aria-hidden />,
      disabledReason: model.enabled ? undefined : 'You cannot handle the table right now.',
      run: () => model.toSideTable(piece, viewWidth),
    },
    ...(model.plan
      ? [
          {
            key: 'plan',
            label: planned ? 'Take out of battle plan' : 'Add to battle plan',
            icon: <Swords size={16} aria-hidden />,
            pressed: planned,
            disabledReason: model.planReason(piece),
            run: () => model.togglePlan(piece),
          },
        ]
      : []),
  ];
}

/** The actions as small icon buttons, for a piece's hover strip or a row's end. */
export function PieceActionButtons({
  model,
  piece,
  viewWidth,
  emphasis = 'standard',
}: Readonly<{ model: HandWindowModel; piece: TablePiece; viewWidth?: number; emphasis?: 'quiet' | 'standard' }>) {
  return (
    <Group gap={4} wrap="nowrap">
      {pieceActions(model, piece, viewWidth).map((action) => (
        <IconAction
          key={action.key}
          size="md"
          emphasis={emphasis}
          label={action.label}
          icon={action.icon}
          pressed={action.pressed}
          disabledReason={action.disabledReason}
          onClick={(event) => {
            event.stopPropagation();
            action.run();
          }}
        />
      ))}
    </Group>
  );
}

/** The same actions in the right-click menu, so a piece's menu never offers less than its buttons. */
export function PieceMenu({
  model,
  anchor,
  onClose,
  viewWidth,
}: Readonly<{ model: HandWindowModel; anchor: HandMenuAnchor | null; onClose: () => void; viewWidth?: number }>) {
  const piece = anchor ? model.planPieces.find((candidate) => candidate.id === anchor.pieceId) : undefined;
  return (
    <HandPieceMenu anchor={anchor} label="Hand actions" onClose={onClose}>
      {piece &&
        pieceActions(model, piece, viewWidth).map((action) => (
          <Menu.Item
            key={action.key}
            leftSection={action.icon}
            disabled={Boolean(action.disabledReason)}
            onClick={() => {
              action.run();
              onClose();
            }}
          >
            {action.label}
          </Menu.Item>
        ))}
    </HandPieceMenu>
  );
}

/** The right-click menu's state and the Alt close-up, which each prototype shares. */
export function usePieceChrome(pieces: readonly TablePiece[]) {
  const [menu, setMenu] = useState<HandMenuAnchor | null>(null);
  const closeUp = useHandCloseUp(pieces);
  return { menu, setMenu, closeUp };
}

/**
 * One piece of the hand: draggable onto the table, its right-click menu and Alt close-up wired, and its motion states: lifted on hover, ringed while in the battle plan, and shrinking away as it leaves for the table or the side-table.
 */
export function HandTile({
  model,
  piece,
  chrome,
  width,
  className,
  children,
  onClick,
  selected,
  style,
}: Readonly<{
  model: HandWindowModel;
  piece: TablePiece;
  chrome: ReturnType<typeof usePieceChrome>;
  width?: number;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  style?: CSSProperties;
}>) {
  const leaving = model.leaving.get(piece.id);
  const planned = model.inPlan(piece);
  const inHand = model.inHand.some((candidate) => candidate.id === piece.id);
  return (
    <div
      className={clsx(styles.tile, className)}
      data-leaving={leaving}
      data-planned={planned || undefined}
      data-selected={selected || undefined}
      data-leader={piece.kind !== 'card' || undefined}
      style={style}
    >
      <button
        type="button"
        className={styles.tileFace}
        draggable={model.enabled && inHand}
        aria-label={`${pieceName(piece)}${planned ? ', in battle plan' : ''}`}
        aria-pressed={onClick ? Boolean(selected) : undefined}
        onDragStart={dragFromHand(piece)}
        onClick={onClick}
        onContextMenu={(event) => chrome.setMenu(handMenuAnchor(event, piece.id))}
        {...chrome.closeUp.hover(piece)}
      >
        <PieceImage piece={piece} width={width} height={width && (piece.kind === 'card' ? (width * 4) / 3 : width)} />
        {planned && (
          <span className={styles.planBadge} aria-hidden>
            <Swords size={11} />
          </span>
        )}
      </button>
      {children}
    </div>
  );
}

/** The close-up and the menu, once per window. */
export function PieceChrome({
  model,
  chrome,
  area,
  viewWidth,
}: Readonly<{
  model: HandWindowModel;
  chrome: ReturnType<typeof usePieceChrome>;
  area: RefObject<HTMLElement | null>;
  viewWidth?: number;
}>) {
  return (
    <>
      <HandPieceCloseUp area={area} piece={chrome.closeUp.piece} />
      <PieceMenu model={model} anchor={chrome.menu} onClose={() => chrome.setMenu(null)} viewWidth={viewWidth} />
    </>
  );
}

/** A group's caption: its name and how many it holds. */
export function GroupCaption({ label, count }: Readonly<{ label: string; count: number }>) {
  return (
    <Text size="xs" fw={700} tt="uppercase" className={styles.caption}>
      {label} <span className={styles.count}>{count}</span>
    </Text>
  );
}

/** What an empty hand says. */
export function EmptyHand() {
  return (
    <Text size="sm" c="dimmed">
      Your hand is empty. Right-click a card or leader on the table and choose Take into hand.
    </Text>
  );
}
