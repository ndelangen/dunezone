import { use } from 'react';

import { pieceKeysNow } from '../../../../../widgets/tabletop/TableKeyboard';
import type { PieceKey } from '../../../../../widgets/tabletop/TableKeyboard';
import { useTabletopSelector } from '../../../../../widgets/tabletop/TabletopContext';
import { CompassTableContext } from '../../compass/compassTable';
import { commandsOf } from '../../compass/shortcuts';
import type { Command } from '../../compass/shortcuts';
import type { Now } from './keyboardShortcuts';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';

const COMMANDS: readonly Command[] = ['raise', 'lower', 'pass', 'faceUp'];

/**
 * What holds at the table for the viewer, read from the checks the keys themselves run: each piece key the table would act on (TableKeyboard's own pieceKeysNow), a resting piece under the pointer for its menu, and each bidding command the compass offers this moment.
 */
function useShortcutMoment(): readonly Now[] {
  /* Joined into a string so the selector returns the same value while nothing changes. */
  const pieceKeys = useTabletopSelector((table) => [...pieceKeysNow(table)].join(' '));
  const menu = useTabletopSelector((table) => table.hoveredPieceId != null && table.state.draftMove == null);
  const commands = commandsOf(use(CompassTableContext));
  return [
    ...(pieceKeys ? (pieceKeys.split(' ') as PieceKey[]) : []),
    ...(menu ? (['piece'] as const) : []),
    ...COMMANDS.filter((command) => commands[command] !== null),
  ];
}

/** The keyboard shortcuts window as the hosted table shows it: the keys for the moment the viewer is in come first. */
export function ConnectedKeyboardShortcutsPanel() {
  return <KeyboardShortcutsPanel now={useShortcutMoment()} />;
}
