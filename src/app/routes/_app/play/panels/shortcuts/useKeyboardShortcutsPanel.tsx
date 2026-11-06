import { use } from 'react';

import { useTabletopSelector } from '../../../../../widgets/tabletop/TabletopContext';
import { CompassTableContext } from '../../compass/compassTable';
import type { Now } from './keyboardShortcuts';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';

/** What holds at the table for the viewer: carrying a piece, a piece under the pointer or selected, and the Bidding phase. */
export function useShortcutMoment(): readonly Now[] {
  const carrying = useTabletopSelector((table) => table.state.draftMove != null);
  const onPiece = useTabletopSelector((table) => table.hoveredPieceId != null || table.selectedPiece != null);
  const bidding = use(CompassTableContext)?.token?.inBidding === true;
  return [
    ...(carrying ? (['carrying'] as const) : []),
    ...(onPiece && !carrying ? (['piece'] as const) : []),
    ...(bidding ? (['bidding'] as const) : []),
  ];
}

/** The keyboard shortcuts window as the hosted table shows it: the keys for the moment the viewer is in come first. */
export function ConnectedKeyboardShortcutsPanel() {
  return <KeyboardShortcutsPanel now={useShortcutMoment()} />;
}
