import type { TablePiece } from '@shared/play/model';
import { createElement } from 'react';
import { fn } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { handGroups } from './handGroups';
import { HandPanel } from './HandPanel';
import type { HandPanelProps } from './HandPanel';
import type { HandActions } from './useHandActions';

/* The viewer's hand in a game in play, with the loose Treachery card drawn into it beside its leaders and Traitor. */
function heldPieces(): TablePiece[] {
  const snapshot = playingSnapshot();
  const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
  return [...snapshot.hand!, { ...card, owner: snapshot.bank!.factionId }];
}

/** The hand as the table hands it to the panel: these pieces in reading order, nothing on its way out, and each action spied. */
export function handActions(inHand: TablePiece[] = heldPieces()): HandActions {
  return {
    enabled: true,
    inHand,
    groups: handGroups(inHand),
    leaving: () => undefined,
    left: fn(),
    playReason: undefined,
    playInFront: fn(),
    toSideTable: fn(),
    reorder: fn(),
  };
}

export const handPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.hand),
  component: HandPanel,
  render: (args: Extract<HandPanelProps, { actions: HandActions }>) => createElement(HandPanel, args),
  args: { isFrozen: false as const, actions: handActions() },
};
